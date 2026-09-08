import { Router } from 'express';
import { currentUser } from '../lib/current-user.js';
import { Container } from '../container.js';
import { validate } from '../middleware/validate.js';
import { PinPlaylistSchema } from '../schemas/playlists.schema.js';

export function createPlaylistsRouter(container: Container) {
  const { playlists, requireAuth } = container;
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      res.json(await playlists.list(currentUser(req).id));
    } catch (e) { next(e); }
  });

  router.post('/', validate({ body: PinPlaylistSchema }), async (req, res, next) => {
    try {
      res.status(201).json(await playlists.pin(currentUser(req).id, req.body));
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      res.json(await playlists.unpin(currentUser(req).id, req.params.id));
    } catch (e) { next(e); }
  });

  return router;
}