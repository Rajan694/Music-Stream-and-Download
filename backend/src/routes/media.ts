import { Router } from 'express';
import { AudioQuality, ErrorCode } from '@music/shared';
import { Container } from '../container.js';
import { ProviderException } from '../errors/provider.exception.js';

const MAX_QUERY_LENGTH = 200;

export function createMediaRouter(container: Container) {
  const { providers, parser, cache, stream } = container;
  const router = Router();

  router.get('/search', async (req, res, next) => {
    try {
      const query = (req.query.q as string ?? '').trim();
      if (!query) {
        throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Query must not be empty');
      }
      if (query.length > MAX_QUERY_LENGTH) {
        throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Query is too long');
      }

      const intent = parser.parse(query);
      if (intent.type === 'video') { res.json({ intent: 'video', id: intent.id }); return; }
      if (intent.type === 'playlist') { res.json({ intent: 'playlist', id: intent.id }); return; }

      const data = await cache.wrap(
        `search:${intent.query.toLowerCase()}`,
        container.env.CACHE_SEARCH_TTL_MS,
        () => providers.search(intent.query),
      );

      res.json({ intent: 'search', data });
    } catch (e) { next(e); }
  });

  router.get('/videos/:id', async (req, res, next) => {
    try {
      const videoId = parser.assertVideoId(req.params.id);
      const video = await cache.wrap(`video:${videoId}`, container.env.CACHE_VIDEO_TTL_MS, () =>
        providers.getVideo(videoId),
      );
      res.json(video);
    } catch (e) { next(e); }
  });

  router.get('/videos/:id/suggestions', async (req, res, next) => {
    try {
      const videoId = parser.assertVideoId(req.params.id);
      const suggestions = await cache.wrap(
        `suggestions:${videoId}`,
        container.env.CACHE_VIDEO_TTL_MS,
        () => providers.getSuggestions(videoId),
      );
      res.json(suggestions);
    } catch (e) { next(e); }
  });

  router.get('/playlists/:id', async (req, res, next) => {
    try {
      const playlistId = parser.assertPlaylistId(req.params.id);
      const playlist = await cache.wrap(
        `playlist:${playlistId}`,
        container.env.CACHE_PLAYLIST_TTL_MS,
        () => providers.getPlaylist(playlistId),
      );
      res.json(playlist);
    } catch (e) { next(e); }
  });

  router.get('/videos/:id/stream', async (req, res, next) => {
    try {
      const videoId = parser.assertVideoId(req.params.id);
      const parsed = AudioQuality.safeParse(req.query.quality ?? 'high');
      if (!parsed.success) {
        throw new ProviderException(ErrorCode.QUALITY_UNAVAILABLE, 'quality must be low, medium or high');
      }
      await stream.streamRelay(videoId, parsed.data, req, res);
    } catch (e) { next(e); }
  });

  return router;
}