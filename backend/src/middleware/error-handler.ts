import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/http-error.js';
import { ErrorCode } from '@music/shared';
import { ProviderException } from '../errors/provider.exception.js';

const PROVIDER_STATUS: Record<string, number> = {
  [ErrorCode.VIDEO_NOT_FOUND]: 404,
  [ErrorCode.PLAYLIST_NOT_FOUND]: 404,
  [ErrorCode.INVALID_SOURCE]: 400,
  [ErrorCode.QUALITY_UNAVAILABLE]: 400,
  [ErrorCode.STREAM_ERROR]: 502,
  [ErrorCode.PROVIDER_TIMEOUT]: 504,
  [ErrorCode.PROVIDER_ERROR]: 502,
  [ErrorCode.UNSUPPORTED_OPERATION]: 501,
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Streaming routes (SSE, file pipe, zip archive) flush headers before they
  // can fail. There is no status left to send, so cut the connection rather
  // than throw ERR_HTTP_HEADERS_SENT on top of the original error.
  if (res.headersSent) {
    console.error(`${req.method} ${req.path} — error after headers sent`, err);
    res.destroy(err);
    return;
  }

  let status = 500;
  let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
  let message = 'Internal server error';

  const route = `${req.method} ${req.path}`;

  if (err instanceof ProviderException) {
    code = err.code;
    message = err.message;
    status = PROVIDER_STATUS[err.code] ?? 503;

    // A rejected URL is user error, not a fault worth an error-level log.
    if (status >= 500) {
      console.error(`${route} — ${err.code}: ${message}`, err.originalError);
    }
  } else if (err instanceof HttpError) {
    status = err.status;
    code = err.code;
    message = err.message;
  } else if (err instanceof SyntaxError && 'body' in err) {
    // body-parser rejecting malformed JSON — a client error, not a 500.
    status = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = 'Malformed JSON body';
  } else {
    console.error(`${route} — unhandled exception`, err);
  }

  if (status === 429) res.set('Retry-After', '60');

  const body = { statusCode: status, code, message };
  res.status(status).json(body);
}