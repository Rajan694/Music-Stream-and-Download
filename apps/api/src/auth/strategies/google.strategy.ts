import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service.js';
import { loadEnv } from '../../config/env.js';

/**
 * Only registered when Google credentials are present — see `auth.module.ts`.
 * Without that guard Passport would register a strategy holding placeholder
 * credentials, and `/auth/google` would redirect users to a Google error page
 * instead of reporting that sign-in is unconfigured.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly auth: AuthService) {
    const env = loadEnv();
    super({
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new UnauthorizedException('Google account has no email address'));
      return;
    }

    try {
      const user = await this.auth.validateGoogleUser({
        email,
        googleId: profile.id,
      });
      done(null, user);
    } catch (error) {
      done(error as Error);
    }
  }
}
