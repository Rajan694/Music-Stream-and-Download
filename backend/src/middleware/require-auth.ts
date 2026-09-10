import type { Request, Response, NextFunction } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import type { PrismaClient } from '@music/db';
import { loadEnv } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { ErrorCode } from '@music/shared';

const env = loadEnv();

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface AccessPayload {
  sub: string;
  email: string;
}

export async function signAccessToken(payload: AccessPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  return payload as unknown as AccessPayload;
}

export async function signRefreshToken(sub: string, jti: string): Promise<string> {
  return new SignJWT({ sub, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_TTL)
    .sign(refreshSecret);
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as unknown as { sub: string; jti: string };
}

/**
 * Built once against the container's Prisma singleton. Constructing a client
 * per request would open a fresh connection pool on every authenticated call.
 */
export function createRequireAuth(prisma: PrismaClient) {
  return async function requireAuth(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = extractToken(req);

    if (!token) throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'No access token provided');

    let payload: AccessPayload;
    try {
      payload = await verifyAccessToken(token);
    } catch {
      throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    // A deleted account must not keep working until its token expires.
    if (!user) throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'User no longer exists');

    req.user = user;
    next();
  };
}

export type RequireAuth = ReturnType<typeof createRequireAuth>;

function extractToken(req: Request): string | undefined {
  const [scheme, headerToken] = req.headers.authorization?.split(' ') ?? [];
  if (scheme === 'Bearer' && headerToken) return headerToken;

  const queryToken = req.query?.token;
  return typeof queryToken === 'string' && queryToken.length > 0 ? queryToken : undefined;
}