import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaConfig } from './media.config.js';
import { PipedProvider } from './providers/piped.provider.js';
import { YtDlpProvider } from './providers/yt-dlp.provider.js';
import { ProviderChain } from './providers/provider-chain.js';
import { SourceUrlParser } from './url/source-url.parser.js';
import { CacheStore, MemoryCacheStore } from '../common/cache/cache.store.js';
import { RedisCacheStore } from '../common/cache/redis-cache.store.js';
import { StreamService } from './stream/stream.service.js';

@Module({
  controllers: [MediaController],
  providers: [
    MediaConfig,
    PipedProvider,
    YtDlpProvider,
    ProviderChain,
    SourceUrlParser,
    StreamService,
    {
      provide: CacheStore,
      // Redis when configured, otherwise the in-process LRU. Callers only ever
      // see the `CacheStore` contract, so nothing downstream knows which.
      useFactory: (config: MediaConfig): CacheStore =>
        config.redisUrl
          ? new RedisCacheStore(config.redisUrl)
          : new MemoryCacheStore(config.cacheMaxEntries),
      inject: [MediaConfig],
    },
  ],
  exports: [
    ProviderChain,
    SourceUrlParser,
    MediaConfig,
    StreamService,
    CacheStore,
  ],
})
export class MediaModule {}
