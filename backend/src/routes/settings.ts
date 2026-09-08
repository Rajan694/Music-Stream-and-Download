import { Router } from 'express';
import { currentUser } from '../lib/current-user.js';
import { Container } from '../container.js';
import { validate } from '../middleware/validate.js';
import { UpdateSettingsSchema } from '../schemas/settings.schema.js';

export function createSettingsRouter(container: Container) {
  const { settings, requireAuth } = container;
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      res.json(await settings.getSettings(currentUser(req).id));
    } catch (e) { next(e); }
  });

  router.patch('/', validate({ body: UpdateSettingsSchema }), async (req, res, next) => {
    try {
      res.json(await settings.updateSettings(currentUser(req).id, req.body));
    } catch (e) { next(e); }
  });

  return router;
}