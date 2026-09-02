import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AudioQuality,
  ErrorCode,
  Playlist,
  SearchResponse,
  Video,
  VideoSummary,
} from '@music/shared';
import { ProviderChain } from './providers/provider-chain.js';
import { SourceUrlParser } from './url/source-url.parser.js';
import { MediaConfig } from './media.config.js';
import { StreamService } from './stream/stream.service.js';
import { CacheStore } from '../common/cache/cache.store.js';
import { ProviderException } from '../common/errors/provider.exception.js';

const MAX_QUERY_LENGTH = 200;

@Controller('media')
export class MediaController {
  constructor(
    private readonly providers: ProviderChain,
    private readonly parser: SourceUrlParser,
    private readonly cache: CacheStore,
    private readonly config: MediaConfig,
    private readonly streamService: StreamService,
  ) {}

  /**
   * Accepts a search phrase, a video URL or a playlist URL and resolves the
   * intent server-side (§10). The response is the discriminated union the web
   * client parses — `intent` is `search`, `video` or `playlist`.
   */
  @Get('search')
  async search(@Query('q') q?: string): Promise<SearchResponse> {
    const query = (q ?? '').trim();
    if (!query) {
      throw new ProviderException(
        ErrorCode.INVALID_SOURCE,
        'Query must not be empty',
      );
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new ProviderException(
        ErrorCode.INVALID_SOURCE,
        'Query is too long',
      );
    }

    const intent = this.parser.parse(query);
    if (intent.type === 'video') return { intent: 'video', id: intent.id };
    if (intent.type === 'playlist')
      return { intent: 'playlist', id: intent.id };

    const data = await this.cache.wrap(
      `search:${intent.query.toLowerCase()}`,
      this.config.searchTtlMs,
      () => this.providers.search(intent.query),
    );

    return { intent: 'search', data };
  }

  @Get('videos/:id')
  getVideo(@Param('id') id: string): Promise<Video> {
    const videoId = this.parser.assertVideoId(id);
    return this.cache.wrap(`video:${videoId}`, this.config.videoTtlMs, () =>
      this.providers.getVideo(videoId),
    );
  }

  @Get('videos/:id/suggestions')
  getSuggestions(@Param('id') id: string): Promise<VideoSummary[]> {
    const videoId = this.parser.assertVideoId(id);
    return this.cache.wrap(
      `suggestions:${videoId}`,
      this.config.videoTtlMs,
      () => this.providers.getSuggestions(videoId),
    );
  }

  @Get('playlists/:id')
  getPlaylist(@Param('id') id: string): Promise<Playlist> {
    const playlistId = this.parser.assertPlaylistId(id);
    return this.cache.wrap(
      `playlist:${playlistId}`,
      this.config.playlistTtlMs,
      () => this.providers.getPlaylist(playlistId),
    );
  }

  @Get('videos/:id/stream')
  streamVideo(
    @Param('id') id: string,
    @Query('quality') quality: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const videoId = this.parser.assertVideoId(id);
    const parsed = AudioQuality.safeParse(quality ?? 'high');
    if (!parsed.success) {
      throw new ProviderException(
        ErrorCode.QUALITY_UNAVAILABLE,
        'quality must be low, medium or high',
      );
    }
    return this.streamService.streamRelay(videoId, parsed.data, req, res);
  }
}
