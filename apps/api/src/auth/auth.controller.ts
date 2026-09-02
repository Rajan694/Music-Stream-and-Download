import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import type { PublicUser } from './auth.service.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { loadEnv } from '../config/env.js';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  private readonly env = loadEnv();

  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.register(
      dto.email,
      dto.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.login(
      dto.email,
      dto.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  /** Rotates the refresh cookie and returns a fresh access token. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedException('No refresh token');

    try {
      const { accessToken, refreshToken } = await this.auth.refresh(presented);
      this.setRefreshCookie(res, refreshToken);
      return { accessToken };
    } catch (error) {
      // The cookie is spent either way — a rejected token must not linger and
      // trigger the reuse alarm on the next attempt.
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: PublicUser) {
    return user;
  }

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  /** Passport redirects to Google; this handler is never actually reached. */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    this.assertGoogleConfigured();
  }

  /**
   * Sets the refresh cookie and bounces to the web app, which exchanges it for
   * an access token via `/auth/refresh`. The access token deliberately does not
   * travel in the redirect URL, where it would land in browser history, proxy
   * logs and the `Referer` header.
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const user = req.user as PublicUser | undefined;
    if (!user) throw new UnauthorizedException('Google authentication failed');

    const { refreshToken } = await this.auth.issueTokensForUser(
      user.id,
      user.email,
    );
    this.setRefreshCookie(res, refreshToken);
    res.redirect(`${this.env.FRONTEND_URL}/auth/callback`);
  }

  private assertGoogleConfigured(): void {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET) {
      throw new NotImplementedException(
        'Google sign-in is not configured on this server',
      );
    }
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: this.env.COOKIE_DOMAIN || undefined,
      path: '/',
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
