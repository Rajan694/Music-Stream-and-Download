import express, { type Application } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Container } from './container.js';
import { requestLogging } from './middleware/request-logging.js';
import { throttle } from './middleware/throttle.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      ['http:', 'https:'].includes(protocol) &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function corsOrigin(container: Container) {
  const { env } = container;
  const allowedOrigins = new Set(env.corsOrigins);
  const allowLoopbackOrigins = env.NODE_ENV !== 'production';

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) { callback(null, true); return; }

    const allowed =
      allowedOrigins.has(origin) ||
      (allowLoopbackOrigins && isLoopbackOrigin(origin));
    callback(null, allowed);
  };
}

export function createApp(container: Container): Application {
  const { env } = container;
  const app = express();

  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(cors({ origin: corsOrigin(container), credentials: true }));
  app.use(requestLogging);
  app.use(throttle);

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        scope: ['email', 'profile'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) { done(new Error('Google account has no email address')); return; }
        try {
          const user = await container.auth.validateGoogleUser({
            email,
            googleId: profile.id,
          });
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ));
    app.use(passport.initialize());
  }

  app.use('/api/v1', createApiRouter(container));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}