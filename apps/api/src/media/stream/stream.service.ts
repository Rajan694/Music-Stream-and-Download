import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AudioQuality, AudioStream, ErrorCode } from '@music/shared';
import { ProviderChain } from '../providers/provider-chain.js';
import { CacheStore } from '../../common/cache/cache.store.js';
import { ProviderException } from '../../common/errors/provider.exception.js';

/**
 * Target bitrates (bits/s) for each quality profile. The closest available
 * stream is chosen rather than assuming the source offers this exact rate
 * (§21) — providers expose whatever YouTube happens to have.
 */
const TARGET_BITRATE: Record<AudioQuality, number> = {
  low: 64_000,
  medium: 128_000,
  high: 192_000,
};

/**
 * Resolved URLs are signed and expire upstream. Well under any plausible
 * expiry, but long enough that seeking within one track does not re-resolve.
 */
const STREAM_URL_TTL_MS = 15 * 60_000;

/** Chrome UA — some upstream hosts reject unknown clients outright. */
const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    private readonly providers: ProviderChain,
    private readonly cache: CacheStore,
  ) {}

  /**
   * Picks the available stream whose bitrate is closest to the profile target.
   * Streams without a reported bitrate sort last so a labelled stream always
   * wins over an unknown one.
   */
  private selectStream(
    streams: AudioStream[],
    quality: AudioQuality,
  ): AudioStream {
    const target = TARGET_BITRATE[quality];

    return streams.reduce((best, candidate) => {
      const bestDelta = best.bitrate
        ? Math.abs(best.bitrate - target)
        : Number.MAX_SAFE_INTEGER;
      const delta = candidate.bitrate
        ? Math.abs(candidate.bitrate - target)
        : Number.MAX_SAFE_INTEGER;
      return delta < bestDelta ? candidate : best;
    });
  }

  /**
   * Resolving means a provider round trip — a yt-dlp spawn takes seconds — and
   * every seek issues a fresh ranged request, so the resolved URL is cached.
   */
  private resolveStreamUrl(
    videoId: string,
    quality: AudioQuality,
  ): Promise<string> {
    return this.cache.wrap(
      `stream:${videoId}:${quality}`,
      STREAM_URL_TTL_MS,
      async () => {
        const video = await this.providers.getVideo(videoId);

        if (!video.audioStreams.length) {
          throw new ProviderException(
            ErrorCode.STREAM_ERROR,
            'No audio stream available for this video',
          );
        }

        return this.selectStream(video.audioStreams, quality).url;
      },
    );
  }

  /**
   * Relays audio bytes from the upstream host. A redirect is not an option:
   * upstream URLs are IP- and session-bound, so the browser fetching them
   * directly fails intermittently.
   */
  async streamRelay(
    videoId: string,
    quality: AudioQuality,
    req: Request,
    res: Response,
  ): Promise<void> {
    const url = await this.resolveStreamUrl(videoId, quality);

    const abort = new AbortController();
    // Express fires `close` on the response once the client goes away; aborting
    // releases the upstream socket instead of draining a body nobody reads.
    res.on('close', () => abort.abort());

    const headers: Record<string, string> = { 'User-Agent': UPSTREAM_UA };
    if (req.headers.range) headers.Range = req.headers.range;

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, { headers, signal: abort.signal });
    } catch (error) {
      if (abort.signal.aborted) return;
      throw new ProviderException(
        ErrorCode.STREAM_ERROR,
        'Upstream stream unavailable',
        error,
      );
    }

    if (!upstream.ok && upstream.status !== 206) {
      // A cached URL that has since expired is the common cause; drop it so the
      // next attempt resolves a fresh one.
      this.cache.delete(`stream:${videoId}:${quality}`);
      await upstream.body?.cancel();
      throw new ProviderException(
        ErrorCode.STREAM_ERROR,
        `Upstream returned ${upstream.status}`,
      );
    }

    res.status(upstream.status);
    for (const header of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
    ]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    // Audio bytes are user-specific and expire upstream; never let a shared
    // cache hold them.
    res.setHeader('Cache-Control', 'private, no-store');

    if (!upstream.body) {
      res.end();
      return;
    }

    try {
      // `pipeline` propagates backpressure and destroys both sides on error,
      // so a dropped client cannot leak the upstream socket.
      await pipeline(
        Readable.fromWeb(
          upstream.body as Parameters<typeof Readable.fromWeb>[0],
        ),
        res,
      );
    } catch (error) {
      if (abort.signal.aborted || res.destroyed) {
        this.logger.debug(`Client aborted stream for ${videoId}`);
        return;
      }
      this.logger.error(
        `Relay failed for ${videoId}: ${(error as Error).message}`,
      );
      if (!res.headersSent) {
        throw new ProviderException(
          ErrorCode.STREAM_ERROR,
          'Stream relay failed',
          error,
        );
      }
      res.end();
    }
  }
}
