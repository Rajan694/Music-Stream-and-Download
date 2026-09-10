import type { Request, Response, NextFunction } from 'express';
import { currentUser } from '../lib/current-user.js';
import { HttpError } from '../lib/http-error.js';
import { ErrorCode } from '@music/shared';

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (user.role !== 'ADMIN') {
    throw new HttpError(403, ErrorCode.FORBIDDEN, 'Admin role required');
  }
  next();
}
