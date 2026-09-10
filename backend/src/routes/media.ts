import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AudioQuality, ErrorCode } from '@music/shared';
import { Container } from '../container.js';
import { ProviderException } from '../errors/provider.exception.js';
import { HttpError } from '../lib/http-error.js';

const MAX_QUERY_LENGTH = 200;

export function createMediaRouter(container: Container) {
  const { providers, parser, cache, stream } = container;
  const router = Router();

  function signTicket(videoId: string, exp: number): string {
    return createHmac('sha256', container.env.STREAM_TICKET_SECRET)
      .update(`${videoId}:${exp}`)
      .digest('hex');
  }

  function mintTicket(videoId: string): string {
    const exp = Math.floor(Date.now() / 1000) + container.env.STREAM_TICKET_TTL_SEC;
    return `${exp}.${signTicket(videoId, exp)}`;
  }

  function verifyTicket(videoId: string, ticket: string): boolean {
    const [expStr, sig] = ticket.split('.');
    if (!expStr || !sig) return false;
    const exp = Number.parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;

    // Constant-time compare: `===` on a hex digest leaks how many leading
    // bytes matched, which is enough to forge a signature byte by byte.
    const presented = Buffer.from(sig, 'hex');
    const expected = Buffer.from(signTicket(videoId, exp), 'hex');
    if (presented.length !== expected.length) return false;
    return timingSafeEqual(presented, expected);
  }

  router.post('/videos/:id/ticket', (req, res, next) => {
    try {
      const videoId = parser.assertVideoId(req.params.id);
      const ticket = mintTicket(videoId);
      res.json({ ticket });
    } catch (e) { next(e); }
  });

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

  router.get('/suggestions', async (req, res) => {
    try {
      const q = (req.query.q as string ?? '').trim();
      if (!q) {
        res.json([]);
        return;
      }
      if (q.length > MAX_QUERY_LENGTH) {
        res.json([]);
        return;
      }
      const suggestions = await cache.wrap(
        `suggest:${q.toLowerCase()}`,
        container.env.CACHE_SEARCH_TTL_MS,
        () => providers.getSearchSuggestions(q),
      );
      res.json(suggestions);
    } catch {
      res.json([]);
    }
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
      // Mandatory, not best-effort: an `if (ticket && ...)` check is bypassed
      // by simply omitting the param, which is the whole attack.
      const ticket = (req.query.sig ?? req.query.ticket) as string | undefined;
      if (!ticket || !verifyTicket(videoId, ticket)) {
        throw new HttpError(
          401,
          ErrorCode.UNAUTHORIZED,
          'A valid stream ticket is required. Mint one at POST /media/videos/:id/ticket',
        );
      }
      const parsed = AudioQuality.safeParse(req.query.quality ?? 'high');
      if (!parsed.success) {
        throw new ProviderException(ErrorCode.QUALITY_UNAVAILABLE, 'quality must be low, medium or high');
      }
      await stream.streamRelay(videoId, parsed.data, req, res);
    } catch (e) { next(e); }
  });

  return router;
}