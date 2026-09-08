import { ErrorCode } from '@music/shared';
import type { ZodType } from 'zod';
import { ProviderException } from '../errors/provider.exception.js';

/**
 * Enforces the DTO boundary: nothing leaves a provider until it validates
 * against the internal domain schema.
 */
export function parseDto<T>(
  schema: ZodType<T>,
  value: unknown,
  context: string,
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    console.error(`${context} failed domain validation — ${issues}`);

    throw new ProviderException(
      ErrorCode.PROVIDER_ERROR,
      'Upstream returned data in an unexpected shape',
    );
  }

  return result.data;
}