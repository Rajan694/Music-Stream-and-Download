import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Attach a unique request id and emit a structured JSON log line at the end
 * of every request (§33). Query strings are stripped from the logged URL to
 * avoid leaking tokens or search terms into logs.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const start = Date.now();

    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const userId = req.user?.id ?? '-';
      const method = req.method;
      const path = req.path; // no query string
      const status = res.statusCode;

      // Use warn for 4xx, error for 5xx.
      const log = {
        requestId,
        userId,
        method,
        path,
        status,
        durationMs: duration,
      };
      if (status >= 500) {
        this.logger.error(JSON.stringify(log));
      } else if (status >= 400) {
        this.logger.warn(JSON.stringify(log));
      } else {
        this.logger.log(JSON.stringify(log));
      }
    });

    next();
  }
}
