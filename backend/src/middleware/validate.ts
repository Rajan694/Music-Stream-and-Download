import type { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { ErrorCode } from '@music/shared';

// `Request.validated` is declared in ../types/express.d.ts.

/**
 * Replaces Nest's ValidationPipe. `.strict()` on a schema reproduces
 * `forbidNonWhitelisted`, `z.coerce` reproduces `transform`, and Zod's default
 * key-stripping reproduces `whitelist`.
 */
export const validate = (spec: { body?: ZodType; query?: ZodType; params?: ZodType }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const out: Record<string, unknown> = {};
    for (const key of ['body', 'query', 'params'] as const) {
      const schema = spec[key];
      if (!schema) continue;
      const parsed = schema.safeParse(req[key]);
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        return next(new HttpError(400, ErrorCode.VALIDATION_ERROR, `${i.path.join('.')}: ${i.message}`));
      }
      out[key] = parsed.data;
    }
    req.validated = out;
    if (spec.body) req.body = out.body;
    next();
  };