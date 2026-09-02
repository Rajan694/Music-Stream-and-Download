import { Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { loadEnv } from '../config/env.js';

const env = loadEnv();

/**
 * The Google strategy is only registered when credentials exist. Registering it
 * unconditionally would mean `/auth/google` redirects to Google with a
 * placeholder client id rather than reporting that sign-in is unavailable.
 */
const googleProviders: Provider[] =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? [GoogleStrategy] : [];

@Module({
  imports: [PassportModule, JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    LocalStrategy,
    ...googleProviders,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
