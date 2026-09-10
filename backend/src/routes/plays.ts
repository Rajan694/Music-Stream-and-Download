import { Router } from 'express';
import { currentUser } from '../lib/current-user.js';
import { Container } from '../container.js';
import { validate } from '../middleware/validate.js';
import { BatchPlayEventsSchema } from '../schemas/history.schema.js';

export function createPlaysRouter(container: Container) {
  const { history, requireAuth } = container;
  const router = Router();

  router.use(requireAuth);

  router.post('/', validate({ body: BatchPlayEventsSchema }), async (req, res, next) => {
    try {
      const user = currentUser(req);
      const result = await history.recordPlayEvents(user.id, req.body.events);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
