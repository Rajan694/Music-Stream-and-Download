import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { MediaModule } from './media/media.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { HistoryModule } from './history/history.module.js';
import { PlaylistsModule } from './playlists/playlists.module.js';
import { DownloadsModule } from './downloads/downloads.module.js';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware.js';

@Module({
  imports: [
    MediaModule,
    DatabaseModule,
    AuthModule,
    SettingsModule,
    HistoryModule,
    PlaylistsModule,
    DownloadsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Structured JSON request logging on every route (§33).
    // Runs before any guard so the request id is available in the response
    // header before rate-limit or auth errors short-circuit.
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
