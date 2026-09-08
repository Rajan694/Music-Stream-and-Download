import { Router } from 'express';
import { currentUser } from '../lib/current-user.js';
import { Container } from '../container.js';
import { validate } from '../middleware/validate.js';
import { RecentSongSchema, SyncHistorySchema } from '../schemas/history.schema.js';

export function createHistoryRouter(container: Container) {
  const { history, requireAuth } = container;
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      res.json(await history.listRecent(currentUser(req).id));
    } catch (e) { next(e); }
  });

  router.post('/', validate({ body: RecentSongSchema }), async (req, res, next) => {
    try {
      res.status(201).json(await history.addRecentSong(currentUser(req).id, req.body));
    } catch (e) { next(e); }
  });

  router.post('/sync', validate({ body: SyncHistorySchema }), async (req, res, next) => {
    try {
      res.status(201).json(await history.syncBatch(currentUser(req).id, req.body.items));
    } catch (e) { next(e); }
  });

  return router;
}