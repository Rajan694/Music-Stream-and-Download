import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaClient } from '@music/db';
import type { Env } from '../config/env.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/require-auth.js';
import { HttpError } from '../lib/http-error.js';
import { ErrorCode } from '@music/shared';

export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  async register(email: string, password: string): Promise<{ user: PublicUser } & AuthTokens> {
    const normalized = email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      throw new HttpError(409, ErrorCode.EMAIL_TAKEN, 'Email already registered');
    }

    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        settings: { create: {} },
      },
    });

    return {
      user: this.toPublic(user),
      ...(await this.issueTokens(user.id, user.email)),
    };
  }

  async validateUser(email: string, password: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user?.passwordHash) {
      await argon2.hash(password, { type: argon2.argon2id });
      return null;
    }

    return (await argon2.verify(user.passwordHash, password))
      ? this.toPublic(user)
      : null;
  }

  async login(email: string, password: string): Promise<{ user: PublicUser } & AuthTokens> {
    const user = await this.validateUser(email, password);
    if (!user) throw new HttpError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');

    return { user, ...(await this.issueTokens(user.id, user.email)) };
  }

  async validateGoogleUser(profile: { email: string; googleId: string }): Promise<PublicUser> {
    const email = profile.email.trim().toLowerCase();

    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      user = byEmail
        ? await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { googleId: profile.googleId },
          })
        : await this.prisma.user.create({
            data: {
              email,
              googleId: profile.googleId,
              settings: { create: {} },
            },
          });
    }

    return this.toPublic(user);
  }

  async issueTokensForUser(userId: string, email: string): Promise<AuthTokens> {
    return this.issueTokens(userId, email);
  }

  async refresh(presentedToken: string): Promise<AuthTokens> {
    const { sub } = await verifyRefreshToken(presentedToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presentedToken) },
    });

    if (!stored) throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Invalid refresh token');

    if (stored.revokedAt) {
      console.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking family ${stored.family}`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Refresh token has already been used');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: sub },
    });
    if (!user) throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'User no longer exists');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user.id, user.email, stored.family);
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presentedToken) },
    });
    if (!stored) return;

    await this.prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    family: string = randomUUID(),
  ): Promise<AuthTokens> {
    const accessToken = await signAccessToken({ sub: userId, email });

    const refreshToken = await signRefreshToken(userId, randomUUID());

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), family, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private toPublic(user: { id: string; email: string; createdAt: Date }): PublicUser {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }
}