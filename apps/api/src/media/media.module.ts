import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaConfig } from './media.config.js';
import { PipedProvider } from './providers/piped.provider.js';
import { YtDlpProvider } from './providers/yt-dlp.provider.js';
import { ProviderChain } from './providers/provider-chain.js';
import { SourceUrlParser } from './url/source-url.parser.js';
import { CacheStore } from '../common/cache/cache.store.js';
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
      useFactory: (config: MediaConfig) =>
        new CacheStore(config.cacheMaxEntries),
      inject: [MediaConfig],
    },
  ],
  exports: [ProviderChain, SourceUrlParser, MediaConfig, StreamService],
})
export class MediaModule {}
