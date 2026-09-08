import { ErrorCode } from '@music/shared';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}