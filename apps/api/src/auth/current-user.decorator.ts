import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Extracts the user attached by `JwtAuthGuard` from the request. */
export const CurrentUser = createParamDecorator(
  (property: keyof Express.User | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    return property ? user?.[property] : user;
  },
);
