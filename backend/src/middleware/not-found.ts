import type { Request, Response } from 'express';
import { ApiError, ErrorCode } from '@music/shared';

export function notFound(req: Request, res: Response): void {
  const body: ApiError = {
    statusCode: 404,
    code: ErrorCode.NOT_FOUND,
    message: `Cannot ${req.method} ${req.path}`,
  };
  res.status(404).json(body);
}