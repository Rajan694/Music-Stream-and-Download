import { ErrorCode } from '@music/shared';

/**
 * Raised by anything in the media layer: providers, the URL parser and the DTO
 * boundary. Carries an application error code so the global filter can map it
 * to a status without inspecting messages.
 *
 * `originalError` is for logs only and is never serialized to a client.
 */
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
