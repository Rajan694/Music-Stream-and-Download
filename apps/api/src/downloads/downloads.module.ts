import { Module } from '@nestjs/common';
import { DownloadsController } from './downloads.controller.js';
import { DownloadsService } from './downloads.service.js';
import { MediaModule } from '../media/media.module.js';

@Module({
  imports: [MediaModule],
  controllers: [DownloadsController],
  providers: [DownloadsService],
  exports: [DownloadsService],
})
export class DownloadsModule {}
