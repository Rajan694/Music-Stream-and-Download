import { createReadStream } from 'node:fs';
import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Res,
  Sse,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DownloadsService } from './downloads.service.js';
import {
  CreateDownloadDto,
  CreatePlaylistDownloadDto,
  EstimateDownloadDto,
  EstimatePlaylistDownloadDto,
} from './dto/download.dto.js';

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const SSE_POLL_MS = 1500;

@Controller('downloads')
export class DownloadsController {
  private readonly logger = new Logger(DownloadsController.name);

  constructor(private readonly downloads: DownloadsService) {}

  /** Estimated output size for a format/quality pair (§22, D6). Public — no user needed. */
  @Post('estimate')
  estimate(@Body() dto: EstimateDownloadDto) {
    return this.downloads.estimate(dto.videoId, dto.format, dto.quality);
  }

  /** Whole-playlist estimate, costing one provider call rather than one per track. Public. */
  @Post('playlist/estimate')
  estimatePlaylist(@Body() dto: EstimatePlaylistDownloadDto) {
    return this.downloads.estimatePlaylist(
      dto.playlistId,
      dto.format,
      dto.quality,
    );
  }

  /** Queues a playlist as one parent job with a `DownloadItem` per track. */
  @Post('playlist')
  @UseGuards(JwtAuthGuard)
  createPlaylist(
    @CurrentUser() user: Express.User,
    @Body() dto: CreatePlaylistDownloadDto,
  ) {
    return this.downloads.createPlaylist(
      user.id,
      dto.playlistId,
      dto.format,
      dto.quality,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: Express.User, @Body() dto: CreateDownloadDto) {
    return this.downloads.create(user.id, dto.videoId, dto.format, dto.quality);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: Express.User) {
    return this.downloads.list(user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: Express.User, @Param('id') id: string) {
    return this.downloads.get(user.id, id);
  }

  /**
   * Progress stream. The worker writes progress to the database, so this polls
   * and closes as soon as a terminal state appears.
   */
  @Sse(':id/events')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getFile(
    @CurrentUser() user: Express.User,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.downloads.getFile(user.id, id);
    this.setAttachmentHeaders(res, file.filename, 'application/octet-stream');
    return new StreamableFile(createReadStream(file.path));
  }

  /** Serves one track out of a playlist job, for retrying or cherry-picking. */
  @Get(':id/items/:itemId/file')
  @UseGuards(JwtAuthGuard)
  async getItemFile(
    @CurrentUser() user: Express.User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.downloads.getItemFile(user.id, id, itemId);
    this.setAttachmentHeaders(res, file.filename, 'application/octet-stream');
    return new StreamableFile(createReadStream(file.path));
  }

  /**
   * Streams a playlist job's tracks as one archive.
   *
   * Stored, not deflated: the entries are already-compressed audio, so
   * compression would burn CPU per byte to save approximately none. Entries are
   * numbered because a playlist can legitimately hold the same title twice, and
   * two identical names in one archive is a corrupt-looking download.
   */
  @Get(':id/archive')
  @UseGuards(JwtAuthGuard)
  async getArchive(
    @CurrentUser() user: Express.User,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { title, files } = await this.downloads.getPlaylistFiles(user.id, id);

    const archiveName = `${title}.zip`;
    this.setAttachmentHeaders(res, archiveName, 'application/zip');

    const archive = new ZipArchive({ zlib: { level: 0 } });
    let failed = false;

    archive.on('error', (error: Error) => {
      failed = true;
      this.logger.error(`Archive failed for job ${id}: ${error.message}`);
      // Headers are already out, so there is no status left to send: cut the
      // connection instead of finishing a truncated zip that looks complete.
      res.destroy(error);
    });

    // Client hung up mid-archive — stop reading files rather than building the
    // rest into a socket nobody is listening on.
    res.on('close', () => {
      if (!res.writableEnded) archive.abort();
    });

    archive.pipe(res);

    const width = String(files.length).length;
    files.forEach((file, index) => {
      const prefix = String(index + 1).padStart(width, '0');
      archive.file(file.path, { name: `${prefix} - ${file.filename}` });
    });

    await archive.finalize();

    if (failed) {
      throw new InternalServerErrorException('Archive generation failed');
    }
  }

  /**
   * RFC 6266: `filename` carries an ASCII fallback while `filename*` carries
   * the real UTF-8 name. Percent-encoding the plain `filename` instead would
   * hand the user "Song%20Name.mp3".
   */
  private setAttachmentHeaders(
    res: Response,
    filename: string,
    contentType: string,
  ): void {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    });
  }
}
