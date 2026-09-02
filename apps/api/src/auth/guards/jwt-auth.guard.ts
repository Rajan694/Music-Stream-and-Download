import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaClient } from '@music/db';
import { loadEnv } from '../../config/env.js';

interface AccessPayload {
  sub?: string;
  email?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly env = loadEnv();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) throw new UnauthorizedException('No access token provided');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.sub) throw new UnauthorizedException('Malformed token');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, createdAt: true },
    });

    // A deleted account must not keep working until its token expires.
    if (!user) throw new UnauthorizedException('User no longer exists');

    request.user = user;
    return true;
  }

  /**
   * `EventSource` cannot set headers, so SSE routes fall back to `?token=`.
   * The request logger records `req.path` without the query string, keeping the
   * token out of logs (§33).
   */
  private extractToken(request: Request): string | undefined {
    const [scheme, headerToken] =
      request.headers.authorization?.split(' ') ?? [];
    if (scheme === 'Bearer' && headerToken) return headerToken;

    const queryToken = request.query?.token;
    return typeof queryToken === 'string' && queryToken.length > 0
      ? queryToken
      : undefined;
  }
}
