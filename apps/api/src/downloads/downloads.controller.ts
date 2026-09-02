import { createReadStream } from 'node:fs';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  Sse,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DownloadsService } from './downloads.service.js';
import { CreateDownloadDto, EstimateDownloadDto } from './dto/download.dto.js';

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const SSE_POLL_MS = 1500;

@Controller('downloads')
@UseGuards(JwtAuthGuard)
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  /** Estimated output size for a format/quality pair (§22, D6). */
  @Post('estimate')
  estimate(@Body() dto: EstimateDownloadDto) {
    return this.downloads.estimate(dto.videoId, dto.format, dto.quality);
  }

  @Post()
  create(@CurrentUser() user: Express.User, @Body() dto: CreateDownloadDto) {
    return this.downloads.create(user.id, dto.videoId, dto.format, dto.quality);
  }

  @Get()
  async list(@CurrentUser() user: Express.User) {
    return this.downloads.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: Express.User, @Param('id') id: string) {
    return this.downloads.get(user.id, id);
  }

  /**
   * Progress stream. The worker writes progress to the database, so this polls
   * and closes as soon as a terminal state appears.
   */
  @Sse(':id/events')
  events(
    @CurrentUser() user: Express.User,
    @Param('id') id: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let stopped = false;

      const emit = async () => {
        if (stopped) return;
        try {
          const job = await this.downloads.get(user.id, id);
          subscriber.next({
            data: JSON.stringify({
              id: job.id,
              videoId: job.videoId,
              title: job.title,
              state: job.state,
              progress: job.progress,
              errorCode: job.errorCode ?? null,
            }),
          } as MessageEvent);

          if (TERMINAL_STATES.has(job.state)) {
            stopped = true;
            subscriber.complete();
          }
        } catch (error) {
          stopped = true;
          subscriber.error(error);
        }
      };

      void emit();
      const handle = setInterval(() => void emit(), SSE_POLL_MS);

      return () => {
        stopped = true;
        clearInterval(handle);
      };
    });
  }

  /** Serves the finished file (D3). Ownership and existence checked upstream. */
  @Get(':id/file')
  async getFile(
    @CurrentUser() user: Express.User,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.downloads.getFile(user.id, id);

    // RFC 6266: `filename` carries an ASCII fallback while `filename*` carries
    // the real UTF-8 name. Percent-encoding the plain `filename` instead would
    // hand the user "Song%20Name.mp3".
    const ascii = file.filename
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '');
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store',
    });

    return new StreamableFile(createReadStream(file.path));
  }
}
