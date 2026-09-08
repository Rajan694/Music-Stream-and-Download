import { ErrorCode } from '@music/shared';

export class ProviderException extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'ProviderException';
  }
}