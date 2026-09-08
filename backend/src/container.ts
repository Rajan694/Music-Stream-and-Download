import { createPrismaClient, PrismaClient } from '@music/db';
import { Env } from './config/env.js';
import { MediaConfig } from './media/config.js';
import { PipedProvider } from './media/providers/piped.provider.js';
import { YtDlpProvider } from './media/providers/yt-dlp.provider.js';
import { ProviderChain } from './media/providers/provider-chain.js';
import { SourceUrlParser } from './media/url/source-url.parser.js';
import { MemoryCacheStore, CacheStore } from './cache/cache.store.js';
import { RedisCacheStore } from './cache/redis-cache.store.js';
import { StreamService } from './media/stream/stream.service.js';
import { createDownloadsQueue } from './queue/downloads.queue.js';
import { createRequireAuth } from './middleware/require-auth.js';

import { AuthService } from './services/auth.service.js';
import { DownloadsService } from './services/downloads.service.js';
import { HistoryService } from './services/history.service.js';
import { PlaylistsService } from './services/playlists.service.js';
import { SettingsService } from './services/settings.service.js';

export function createContainer(env: Env) {
  const prisma: PrismaClient = createPrismaClient();
  const cache: CacheStore = env.REDIS_URL
    ? new RedisCacheStore(env.REDIS_URL)
    : new MemoryCacheStore(env.CACHE_MAX_ENTRIES);
  const mediaConfig = new MediaConfig();
  const providers = new ProviderChain(new PipedProvider(mediaConfig), new YtDlpProvider(mediaConfig));
  const parser = new SourceUrlParser();
  const downloadsQueue = createDownloadsQueue(env);
  
  const auth = new AuthService(prisma, env);
  const downloads = new DownloadsService(prisma, providers, downloadsQueue);
  const history = new HistoryService(prisma);
  const playlists = new PlaylistsService(prisma);
  const settings = new SettingsService(prisma);
  const stream = new StreamService(providers, cache);
  const requireAuth = createRequireAuth(prisma);

  return {
    env,
    prisma,
    cache,
    providers,
    parser,
    downloadsQueue,
    stream,
    requireAuth,
    auth,
    downloads,
    history,
    playlists,
    settings,
    async shutdown() {
      await Promise.allSettled([
        cache.close(),
        downloadsQueue.close(),
        prisma.$disconnect(),
      ]);
    },
  };
}

export type Container = ReturnType<typeof createContainer>;