import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaClient } from '@music/db';
import { loadEnv } from '../config/env.js';

export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Refresh tokens are looked up by hash on every refresh, so the digest must be
 * deterministic. Argon2 is salted and therefore unsearchable — correct for
 * passwords, unusable here. SHA-256 is sound for a 128-bit random token: there
 * is no low-entropy input to brute-force.
 */
/**
 * `jsonwebtoken` types `expiresIn` as a template-literal union (`'15m'`,
 * `'30d'`, …). Config arrives as a plain string, so it is narrowed once here
 * rather than cast at each call site.
 */
type ExpiresIn = Exclude<
  Parameters<JwtService['signAsync']>[1],
  undefined
>['expiresIn'];

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
  ) {}

  // ─── Registration ───────────────────────────────────────────────────────────

  async register(
    email: string,
    password: string,
  ): Promise<{ user: PublicUser } & AuthTokens> {
    const normalized = email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
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

  // ─── Password login ─────────────────────────────────────────────────────────

  async validateUser(
    email: string,
    password: string,
  ): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Hash even when the account is missing or OAuth-only, so response time
    // does not reveal which emails are registered.
    if (!user?.passwordHash) {
      await argon2.hash(password, { type: argon2.argon2id });
      return null;
    }

    return (await argon2.verify(user.passwordHash, password))
      ? this.toPublic(user)
      : null;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: PublicUser } & AuthTokens> {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    return { user, ...(await this.issueTokens(user.id, user.email)) };
  }

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  async validateGoogleUser(profile: {
    email: string;
    googleId: string;
  }): Promise<PublicUser> {
    const email = profile.email.trim().toLowerCase();

    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    // Same person signing in a second way: link the Google id to the account
    // that already owns the address.
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

  // ─── Refresh rotation ───────────────────────────────────────────────────────

  /**
   * Rotates a refresh token. Each refresh issues a new token in the same
   * family and revokes the presented one; presenting an already-revoked token
   * means it leaked, so the whole family is killed and every session for that
   * user ends.
   */
  async refresh(presentedToken: string): Promise<AuthTokens> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(presentedToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presentedToken) },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking family ${stored.family}`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user.id, user.email, stored.family);
  }

  /** Revokes the presented token's whole family, ending every session on it. */
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

  // ─── Internals ──────────────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    email: string,
    family: string = randomUUID(),
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.env.JWT_ACCESS_SECRET,
        expiresIn: this.env.JWT_ACCESS_TTL as ExpiresIn,
      },
    );

    // `jti` keeps sibling refresh tokens distinct: two refreshes in the same
    // second would otherwise produce identical payloads, hence identical
    // tokens, and collide on the unique hash column.
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti: randomUUID() },
      {
        secret: this.env.JWT_REFRESH_SECRET,
        expiresIn: this.env.JWT_REFRESH_TTL as ExpiresIn,
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), family, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private toPublic(user: {
    id: string;
    email: string;
    createdAt: Date;
  }): PublicUser {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }
}
