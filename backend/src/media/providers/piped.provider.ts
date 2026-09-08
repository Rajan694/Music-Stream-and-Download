import { Playlist, SearchResult, Video, VideoSummary, ErrorCode, VideoSchema, PlaylistSchema, SearchResultSchema } from '@music/shared';
import { MediaProvider } from './media-provider.interface.js';
import { ProviderException } from '../../errors/provider.exception.js';
import { parseDto } from '../../dto/parse-dto.js';
import { MediaConfig } from '../config.js';

type PipedPayload = Record<string, any>;

export class PipedProvider implements MediaProvider {
  readonly name = 'piped';

  constructor(private readonly config: MediaConfig) {}

  private get instances(): string[] {
    return [this.config.pipedApiUrl, ...this.config.pipedFallbackUrls].filter(Boolean);
  }

  private async fetchOnce(
    instance: string,
    path: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(path, instance).toString();
    const perRequest = AbortSignal.timeout(this.config.providerTimeoutMs);
    const combined = AbortSignal.any([signal, perRequest]);

    const response = await fetch(url, { signal: combined });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  private async request<T = PipedPayload>(path: string): Promise<T> {
    const deadline = AbortSignal.timeout(this.config.providerDeadlineMs);
    const attempts = this.config.providerRetries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
      for (const instance of this.instances) {
        if (deadline.aborted) break;
        try {
          return (await this.fetchOnce(instance, path, deadline)) as T;
        } catch (error) {
          lastError = error;
        }
      }

      const isLastAttempt = attempt === attempts - 1;
      if (isLastAttempt || deadline.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }

    if (deadline.aborted) {
      throw new ProviderException(
        ErrorCode.PROVIDER_TIMEOUT,
        'Piped did not respond in time',
        lastError,
      );
    }
    throw new ProviderException(
      ErrorCode.PROVIDER_UNAVAILABLE,
      'Piped request failed across all instances',
      lastError,
    );
  }

  private idFromUrl(url: unknown, param: 'v' | 'list'): string {
    if (typeof url !== 'string') return '';
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    return new URLSearchParams(query).get(param) ?? '';
  }

  private toSummary(item: PipedPayload): VideoSummary {
    return {
      id: this.idFromUrl(item.url, 'v'),
      title: item.title ?? '',
      uploaderName: item.uploaderName ?? item.uploader ?? '',
      duration: Math.max(0, Math.trunc(item.duration ?? 0)),
      thumbnails: item.thumbnail ? [{ url: item.thumbnail }] : [],
      viewCount: item.views >= 0 ? item.views : undefined,
      uploadDate: item.uploadedDate ?? undefined,
    };
  }

  async getVideo(id: string): Promise<Video> {
    const data = await this.request(`/streams/${encodeURIComponent(id)}`);

    if (data.error) {
      throw new ProviderException(
        ErrorCode.VIDEO_NOT_FOUND,
        'Video not found',
        data.error,
      );
    }

    return parseDto(
      VideoSchema,
      {
        id,
        title: data.title,
        uploaderName: data.uploader,
        uploaderId: data.uploaderUrl?.split('/').pop(),
        duration: data.duration,
        thumbnails: data.thumbnailUrl ? [{ url: data.thumbnailUrl }] : [],
        description: data.description,
        viewCount: data.views,
        likeCount: data.likes >= 0 ? data.likes : undefined,
        uploadDate: data.uploadDate,
        audioStreams: (data.audioStreams ?? []).map((stream: PipedPayload) => ({
          url: stream.url,
          mimeType: stream.mimeType,
          bitrate: stream.bitrate,
          contentLength: stream.contentLength > 0 ? stream.contentLength : undefined,
          codec: stream.codec,
        })),
        relatedVideos: (data.relatedStreams ?? [])
          .filter(
            (item: PipedPayload) =>
              item.type !== 'channel' && item.type !== 'playlist',
          )
          .map((item: PipedPayload) => this.toSummary(item))
          .filter((item: VideoSummary) => item.id !== ''),
      },
      'piped.getVideo',
    );
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const data = await this.request(`/playlists/${encodeURIComponent(id)}`);

    if (data.error) {
      throw new ProviderException(
        ErrorCode.PLAYLIST_NOT_FOUND,
        'Playlist not found',
        data.error,
      );
    }

    const videos = (data.relatedStreams ?? [])
      .map((item: PipedPayload) => this.toSummary(item))
      .filter((item: VideoSummary) => item.id !== '');

    return parseDto(
      PlaylistSchema,
      {
        id,
        title: data.name,
        uploaderName: data.uploader ?? '',
        videoCount: data.videos ?? data.streamCount ?? videos.length,
        thumbnails: data.thumbnailUrl ? [{ url: data.thumbnailUrl }] : [],
        description: data.description ?? undefined,
        videos,
        nextPage: data.nextpage ?? null,
      },
      'piped.getPlaylist',
    );
  }

  async search(query: string): Promise<SearchResult> {
    const data = await this.request(
      `/search?q=${encodeURIComponent(query)}&filter=all`,
    );

    const items = (data.items ?? [])
      .map((item: PipedPayload) => {
        if (item.type === 'stream') {
          const summary = this.toSummary(item);
          return summary.id ? { type: 'video' as const, ...summary } : null;
        }
        if (item.type === 'playlist') {
          const id = this.idFromUrl(item.url, 'list');
          return id
            ? {
                type: 'playlist' as const,
                id,
                title: item.name ?? '',
                uploaderName: item.uploaderName ?? '',
                videoCount: Math.max(0, Math.trunc(item.videos ?? 0)),
                thumbnails: item.thumbnail ? [{ url: item.thumbnail }] : [],
              }
            : null;
        }
        return null;
      })
      .filter(Boolean);

    return parseDto(
      SearchResultSchema,
      {
        items,
        nextPage: data.nextpage ?? null,
        suggestion: data.suggestion ?? null,
      },
      'piped.search',
    );
  }

  async getSuggestions(videoId: string): Promise<VideoSummary[]> {
    const video = await this.getVideo(videoId);
    return video.relatedVideos;
  }
}