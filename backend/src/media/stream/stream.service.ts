import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { AudioQuality, AudioStream, ErrorCode } from '@music/shared';
import { ProviderChain } from '../providers/provider-chain.js';
import { CacheStore } from '../../cache/cache.store.js';
import { ProviderException } from '../../errors/provider.exception.js';

const TARGET_BITRATE: Record<AudioQuality, number> = {
  low: 64_000,
  medium: 128_000,
  high: 192_000,
};

const STREAM_URL_TTL_MS = 15 * 60_000;

const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class StreamService {
  constructor(
    private readonly providers: ProviderChain,
    private readonly cache: CacheStore,
  ) {}

  private selectStream(streams: AudioStream[], quality: AudioQuality): AudioStream {
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

  private resolveStreamUrl(videoId: string, quality: AudioQuality): Promise<string> {
    return this.cache.wrap(`stream:${videoId}:${quality}`, STREAM_URL_TTL_MS, async () => {
      const video = await this.providers.getVideo(videoId);

      if (!video.audioStreams.length) {
        throw new ProviderException(
          ErrorCode.STREAM_ERROR,
          'No audio stream available for this video',
        );
      }

      return this.selectStream(video.audioStreams, quality).url;
    });
  }

  async streamRelay(videoId: string, quality: AudioQuality, req: Request, res: Response): Promise<void> {
    const url = await this.resolveStreamUrl(videoId, quality);

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    const headers: Record<string, string> = { 'User-Agent': UPSTREAM_UA };
    if (req.headers.range) headers.Range = req.headers.range;

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, { headers, signal: abort.signal });
    } catch (error) {
      if (abort.signal.aborted) return;
      throw new ProviderException(ErrorCode.STREAM_ERROR, 'Upstream stream unavailable', error);
    }

    if (!upstream.ok && upstream.status !== 206) {
      await this.cache.delete(`stream:${videoId}:${quality}`);
      await upstream.body?.cancel();
      throw new ProviderException(ErrorCode.STREAM_ERROR, `Upstream returned ${upstream.status}`);
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
    res.setHeader('Cache-Control', 'private, no-store');

    if (!upstream.body) {
      res.end();
      return;
    }

    try {
      await pipeline(
        Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),
        res,
      );
    } catch (error) {
      if (abort.signal.aborted || res.destroyed) {
        console.debug(`Client aborted stream for ${videoId}`);
        return;
      }
      console.error(`Relay failed for ${videoId}: ${(error as Error).message}`);
      if (!res.headersSent) {
        throw new ProviderException(ErrorCode.STREAM_ERROR, 'Stream relay failed', error);
      }
      res.end();
    }
  }
}