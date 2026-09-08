import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

const log = logger.create('HTTP');

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const start = Date.now();

  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.user?.id ?? '-';
    const method = req.method;
    const path = req.path;
    const status = res.statusCode;

    const logEntry = {
      requestId,
      userId,
      method,
      path,
      status,
      durationMs: duration,
    };
    if (status >= 500) {
      log.error(JSON.stringify(logEntry));
    } else if (status >= 400) {
      log.warn(JSON.stringify(logEntry));
    } else {
      log.log(JSON.stringify(logEntry));
    }
  });

  next();
}