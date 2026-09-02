import { Logger } from '@nestjs/common';
import { ErrorCode } from '@music/shared';
import type { ZodType } from 'zod';
import { ProviderException } from '../errors/provider.exception.js';

const logger = new Logger('DtoBoundary');

/**
 * Enforces the DTO boundary: nothing leaves a provider until it validates
 * against the internal domain schema. A provider changing its payload shape
 * fails here with a provider error instead of leaking a malformed object to
 * the frontend.
 *
 * The Zod issue list is logged, never returned — it can quote provider fields.
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
    logger.error(`${context} failed domain validation — ${issues}`);

    throw new ProviderException(
      ErrorCode.PROVIDER_ERROR,
      'Upstream returned data in an unexpected shape',
    );
  }

  return result.data;
}
