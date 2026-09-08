import type { Request } from 'express';
import { ErrorCode } from '@music/shared';
import { HttpError } from './http-error.js';

/**
 * Reads the user attached by `requireAuth`. Typed as non-optional because
 * every caller sits behind that middleware; the throw is a guard against a
 * route being wired up without it, not an expected path.
 */
export function currentUser(req: Request): Express.User {
  if (!req.user) {
    throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Not authenticated');
  }
  return req.user;
}
