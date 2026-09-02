import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ApiError, ErrorCode } from '@music/shared';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { ThrottleGuard } from './common/guards/throttle.guard.js';
import { loadEnv } from './config/env.js';

const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  // Validated up front so a bad value fails at boot, not mid-request.
  const env = loadEnv();

  const app = await NestFactory.create(AppModule);

  // ── Security headers ────────────────────────────────────────────────────────
  // Helmet sets standard headers (X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, etc.) and strips X-Powered-By.
  app.use(helmet());

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Rate limiting (custom sliding-window guard) ────────────────────────────
  // No external store — in-memory per process. Three tiers:
  //   • 100 req / 60 s per IP (anonymous) or per userId (authed)
  //   • 20  req / 60 s on /downloads  (primary abuse lever)
  //   • 60  req / 60 s on /media/search (protects upstream provider quota)
  app.useGlobalGuards(new ThrottleGuard());

  app.use(cookieParser());

  // ── Request body limits ─────────────────────────────────────────────────────
  // 1 MB is generous for the JSON payloads we accept (search queries, auth
  // forms, download requests). Upload paths don't exist in this API.
  // We override the default body parser limit via Express middleware because
  // NestJS 12 ValidationPipe doesn't accept a `body` size option.
  app.use(express.json({ limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  // Routes are mounted during init, so a handler registered afterwards runs
  // only for unmatched paths — otherwise Express replies with an HTML page and
  // a JSON client gets an unparseable body.
  await app.init();
  app
    .getHttpAdapter()
    .getInstance()
    .use((req: Request, res: Response, _next: NextFunction) => {
      const body: ApiError = {
        statusCode: 404,
        code: ErrorCode.NOT_FOUND,
        message: `Cannot ${req.method} ${req.path}`,
      };
      res.status(404).json(body);
    });

  await app.listen(env.API_PORT);
  console.info(
    `API listening on http://localhost:${env.API_PORT}/${API_PREFIX}`,
  );
}

await bootstrap();
