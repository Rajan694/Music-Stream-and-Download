import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, ErrorCode } from '@music/shared';
import { ProviderException } from '../errors/provider.exception.js';

const PROVIDER_STATUS: Record<string, HttpStatus> = {
  [ErrorCode.VIDEO_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.PLAYLIST_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.INVALID_SOURCE]: HttpStatus.BAD_REQUEST,
  // A bad `quality=` value is a malformed request, not an outage.
  [ErrorCode.QUALITY_UNAVAILABLE]: HttpStatus.BAD_REQUEST,
  [ErrorCode.STREAM_ERROR]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.PROVIDER_TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
  [ErrorCode.PROVIDER_ERROR]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.UNSUPPORTED_OPERATION]: HttpStatus.NOT_IMPLEMENTED,
};

const HTTP_STATUS_CODES: Partial<Record<HttpStatus, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/**
 * Single exit point for errors. Every failure leaves as the same `ApiError`
 * envelope; provider internals, stack traces and filesystem paths stay in the
 * logs (§32).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const route = `${request.method} ${request.path}`;

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'Internal server error';

    if (exception instanceof ProviderException) {
      code = exception.code;
      message = exception.message;
      status =
        PROVIDER_STATUS[exception.code] ?? HttpStatus.SERVICE_UNAVAILABLE;

      // A rejected URL is user error, not a fault worth an error-level log.
      if (status >= 500) {
        this.logger.error(
          `${route} — ${code}: ${message}`,
          exception.originalError,
        );
      } else {
        this.logger.debug(`${route} — ${code}: ${message}`);
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = HTTP_STATUS_CODES[status] ?? ErrorCode.INTERNAL_ERROR;

      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      message = Array.isArray(raw) ? raw[0] : raw;

      if (status >= 500) {
        this.logger.error(`${route} — ${message}`, exception.stack);
      }
    } else {
      this.logger.error(
        `${route} — unhandled exception`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiError = { statusCode: status, code, message };
    response.status(status).json(body);
  }
}
