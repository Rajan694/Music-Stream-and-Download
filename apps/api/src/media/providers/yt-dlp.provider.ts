import { spawn } from 'node:child_process';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  ErrorCode,
  Playlist,
  PlaylistSchema,
  SearchResult,
  SearchResultSchema,
  Video,
  VideoSchema,
  VideoSummary,
  VideoSummarySchema,
} from '@music/shared';
import { MediaProvider } from './media-provider.interface.js';
import { ProviderException } from '../../common/errors/provider.exception.js';
import { parseDto } from '../../common/dto/parse-dto.js';
import { MediaConfig } from '../media.config.js';

type YtDlpPayload = Record<string, any>;

/** Guard against a hostile or pathological dump exhausting memory. */
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

/** Matches the length of a Piped `relatedVideos` list. */
const SUGGESTIONS_LIMIT = 20;

@Injectable()
export class YtDlpProvider implements MediaProvider {
  readonly name = 'ytdlp';
  private readonly logger = new Logger(YtDlpProvider.name);

  constructor(private readonly config: MediaConfig) {}

  /**
   * Runs yt-dlp with a fixed argument array — never a shell string, so user
   * input cannot become a flag or a command (§28).
   */
  private execute(args: string[]): Promise<YtDlpPayload> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.ytDlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const kill = (code: ErrorCode, message: string, cause?: unknown) => {
        child.kill('SIGKILL');
        finish(() => reject(new ProviderException(code, message, cause)));
      };

      const timer = setTimeout(
        () => kill(ErrorCode.PROVIDER_TIMEOUT, 'yt-dlp timed out'),
        this.config.ytDlpTimeoutMs,
      );

      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT_BYTES) {
          kill(
            ErrorCode.PROVIDER_ERROR,
            'yt-dlp produced an oversized response',
          );
          return;
        }
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        // Bounded: stderr is only ever used for a truncated log line.
        if (stderr.length < 4096) stderr += chunk.toString();
      });

      // Without this listener a missing binary emits an unhandled 'error'
      // event, which terminates the process rather than failing the request.
      child.on('error', (error) => {
        finish(() =>
          reject(
            new ProviderException(
              ErrorCode.PROVIDER_UNAVAILABLE,
              'yt-dlp is not available',
              error,
            ),
          ),
        );
      });

      child.on('close', (code) => {
        finish(() => {
          if (code !== 0) {
            this.logger.warn(
              `yt-dlp exited with code ${code}: ${stderr.trim().slice(0, 300)}`,
            );
            reject(
              new ProviderException(
                ErrorCode.PROVIDER_UNAVAILABLE,
                'yt-dlp execution failed',
              ),
            );
            return;
          }

          const trimmed = stdout.trim();
          if (!trimmed) {
            reject(
              new ProviderException(
                ErrorCode.PROVIDER_UNAVAILABLE,
                'yt-dlp returned no data',
              ),
            );
            return;
          }

          try {
            // `-J` emits a single JSON document; be tolerant of a trailing newline.
            resolve(JSON.parse(trimmed) as YtDlpPayload);
          } catch (error) {
            reject(
              new ProviderException(
                ErrorCode.PROVIDER_ERROR,
                'Invalid response from yt-dlp',
                error,
              ),
            );
          }
        });
      });
    });
  }

  private toSummary(entry: YtDlpPayload): VideoSummary {
    return {
      id: entry.id ?? '',
      title: entry.title ?? '',
      uploaderName: entry.uploader ?? entry.channel ?? '',
      duration: Math.max(0, Math.trunc(entry.duration ?? 0)),
      thumbnails: (entry.thumbnails ?? [])
        .filter((thumb: YtDlpPayload) => typeof thumb.url === 'string')
        .map((thumb: YtDlpPayload) => ({
          url: thumb.url,
          width: thumb.width,
          height: thumb.height,
        })),
      viewCount: entry.view_count ?? undefined,
    };
  }

  async getVideo(id: string): Promise<Video> {
    const data = await this.execute([
      '-J',
      '--no-playlist',
      `https://www.youtube.com/watch?v=${id}`,
    ]);
    const formats: YtDlpPayload[] = data.formats ?? [];

    return parseDto(
      VideoSchema,
      {
        ...this.toSummary(data),
        id: data.id ?? id,
        uploaderId: data.uploader_id ?? undefined,
        description: data.description ?? undefined,
        likeCount: data.like_count ?? undefined,
        uploadDate: data.upload_date ?? undefined,
        audioStreams: formats
          .filter((f) => f.vcodec === 'none' && f.acodec !== 'none' && f.url)
          .map((f) => ({
            url: f.url,
            mimeType: f.ext === 'm4a' ? 'audio/mp4' : 'audio/webm',
            // yt-dlp reports abr in kbit/s; the domain model uses bits/s.
            bitrate: f.abr ? Math.round(f.abr * 1000) : undefined,
            contentLength: f.filesize ?? f.filesize_approx ?? undefined,
            codec: f.acodec,
          })),
        // The video dump carries no related list; `getSuggestions` fetches
        // them separately from the mix playlist.
        relatedVideos: [],
      },
      'ytdlp.getVideo',
    );
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const data = await this.execute([
      '-J',
      '--flat-playlist',
      `https://www.youtube.com/playlist?list=${id}`,
    ]);
    const videos = (data.entries ?? [])
      .map((entry: YtDlpPayload) => this.toSummary(entry))
      .filter((entry: VideoSummary) => entry.id !== '');

    return parseDto(
      PlaylistSchema,
      {
        id: data.id ?? id,
        title: data.title ?? '',
        uploaderName: data.uploader ?? data.channel ?? '',
        uploaderId: data.uploader_id ?? undefined,
        videoCount: data.playlist_count ?? videos.length,
        thumbnails: (data.thumbnails ?? [])
          .filter((thumb: YtDlpPayload) => typeof thumb.url === 'string')
          .map((thumb: YtDlpPayload) => ({ url: thumb.url })),
        description: data.description ?? undefined,
        videos,
        nextPage: null,
      },
      'ytdlp.getPlaylist',
    );
  }

  async search(query: string): Promise<SearchResult> {
    // The query is embedded after the `ytsearch10:` prefix inside a single
    // argv entry, so it can never be parsed as a flag.
    const data = await this.execute([
      '-J',
      '--flat-playlist',
      `ytsearch10:${query}`,
    ]);

    const items = (data.entries ?? [])
      .map((entry: YtDlpPayload) => ({
        type: 'video' as const,
        ...this.toSummary(entry),
      }))
      .filter((item: VideoSummary) => item.id !== '');

    return parseDto(
      SearchResultSchema,
      { items, nextPage: null },
      'ytdlp.search',
    );
  }

  /**
   * yt-dlp exposes no `relatedVideos` field, so suggestions come from the
   * auto-generated "Mix" radio playlist (`RD<videoId>`) — YouTube's own
   * related-track feed for a video. Without this the chain has no fallback for
   * suggestions and answers 503 whenever Piped is down.
   */
  async getSuggestions(videoId: string): Promise<VideoSummary[]> {
    const data = await this.execute([
      '-J',
      '--flat-playlist',
      // The seed video is entry one, so fetch one extra to still return a full
      // page after dropping it.
      '--playlist-end',
      String(SUGGESTIONS_LIMIT + 1),
      `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`,
    ]);

    const items = (data.entries ?? [])
      .map((entry: YtDlpPayload) => this.toSummary(entry))
      .filter((item: VideoSummary) => item.id !== '' && item.id !== videoId)
      .slice(0, SUGGESTIONS_LIMIT);

    return parseDto(z.array(VideoSummarySchema), items, 'ytdlp.getSuggestions');
  }
}
