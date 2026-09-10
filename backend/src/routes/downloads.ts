import { Router, type Response } from 'express';
import { currentUser } from '../lib/current-user.js';
import { Container } from '../container.js';
import { validate } from '../middleware/validate.js';
import { CreateDownloadSchema, CreatePlaylistDownloadSchema, EstimateDownloadSchema, EstimatePlaylistDownloadSchema } from '../schemas/downloads.schema.js';
import { createReadStream } from 'node:fs';
import { ZipArchive } from 'archiver';

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const SSE_POLL_MS = 1500;

export function createDownloadsRouter(container: Container) {
  const { downloads, requireAuth } = container;
  const router = Router();

  router.post('/estimate', requireAuth, validate({ body: EstimateDownloadSchema }), async (req, res, next) => {
    try {
      const result = await downloads.estimate(req.body.videoId, req.body.format, req.body.quality);
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/playlist/estimate', requireAuth, validate({ body: EstimatePlaylistDownloadSchema }), async (req, res, next) => {
    try {
      const result = await downloads.estimatePlaylist(req.body.playlistId, req.body.format, req.body.quality);
      res.json(result);
    } catch (e) { next(e); }
  });

  router.post('/playlist', requireAuth, validate({ body: CreatePlaylistDownloadSchema }), async (req, res, next) => {
    try {
      const result = await downloads.createPlaylist(currentUser(req).id, req.body.playlistId, req.body.format, req.body.quality);
      res.status(201).json(result);
    } catch (e) { next(e); }
  });

  router.post('/', requireAuth, validate({ body: CreateDownloadSchema }), async (req, res, next) => {
    try {
      const result = await downloads.create(currentUser(req).id, req.body.videoId, req.body.format, req.body.quality);
      res.status(201).json(result);
    } catch (e) { next(e); }
  });

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      res.json(await downloads.list(currentUser(req).id));
    } catch (e) { next(e); }
  });

  router.get('/:id', requireAuth, async (req, res, next) => {
    try {
      res.json(await downloads.get(currentUser(req).id, req.params.id as string));
    } catch (e) { next(e); }
  });

  router.get('/:id/events', requireAuth, async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const job = await downloads.get(currentUser(req).id, req.params.id as string);
        res.write(`data: ${JSON.stringify({
          id: job.id,
          videoId: job.videoId,
          title: job.title,
          state: job.state,
          progress: job.progress,
          errorCode: job.errorCode ?? null,
        })}\n\n`);
        
        if (TERMINAL_STATES.has(job.state)) {
          stopped = true;
          clearInterval(h);
          res.end();
        }
      } catch {
        stopped = true;
        clearInterval(h);
        res.end();
      }
    };

    const h = setInterval(() => void tick(), SSE_POLL_MS);
    req.on('close', () => {
      stopped = true;
      clearInterval(h);
    });
    void tick();
  });

  function setAttachmentHeaders(res: Response, filename: string, contentType: string) {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    });
  }

  router.get('/:id/file', requireAuth, async (req, res, next) => {
    try {
      const file = await downloads.getFile(currentUser(req).id, req.params.id as string);
      setAttachmentHeaders(res, file.filename, 'application/octet-stream');
      const stream = createReadStream(file.path);
      stream.on('error', next);
      stream.pipe(res);
    } catch (e) { next(e); }
  });

  router.get('/:id/items/:itemId/file', requireAuth, async (req, res, next) => {
    try {
      const file = await downloads.getItemFile(currentUser(req).id, req.params.id as string, req.params.itemId as string);
      setAttachmentHeaders(res, file.filename, 'application/octet-stream');
      const stream = createReadStream(file.path);
      stream.on('error', next);
      stream.pipe(res);
    } catch (e) { next(e); }
  });

  router.get('/:id/archive', requireAuth, async (req, res, next) => {
    try {
      const { title, files } = await downloads.getPlaylistFiles(currentUser(req).id, req.params.id as string);
      
      const archiveName = `${title}.zip`;
      setAttachmentHeaders(res, archiveName, 'application/zip');
      
      const archive = new ZipArchive({ zlib: { level: 0 } });
      let failed = false;

      archive.on('error', (error: Error) => {
        failed = true;
        res.destroy(error);
      });

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
        throw new Error('Archive generation failed');
      }
    } catch (e) { next(e); }
  });

  return router;
}