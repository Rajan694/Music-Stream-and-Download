import { Router } from 'express';
import { Container } from '../container.js';
import { createAuthRouter } from './auth.js';
import { createMediaRouter } from './media.js';
import { createDownloadsRouter } from './downloads.js';
import { createHistoryRouter } from './history.js';
import { createPlaylistsRouter } from './playlists.js';
import { createSettingsRouter } from './settings.js';
import { createHealthRouter } from './health.js';
import { createAdminRouter } from './admin.js';
import { createPlaysRouter } from './plays.js';

export function createApiRouter(container: Container) {
  const router = Router();

  router.use('/health', createHealthRouter(container));
  router.use('/auth', createAuthRouter(container));
  router.use('/media', createMediaRouter(container));
  router.use('/downloads', createDownloadsRouter(container));
  router.use('/me/history', createHistoryRouter(container));
  router.use('/me/plays', createPlaysRouter(container));
  router.use('/me/playlists', createPlaylistsRouter(container));
  router.use('/me/settings', createSettingsRouter(container));
  router.use('/admin', createAdminRouter(container));

  return router;
}