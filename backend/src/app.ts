import express, { type Application } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
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
  const app = express();

  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(cors({ origin: corsOrigin(container), credentials: true }));
  app.use(requestLogging);
  app.use(throttle);

  app.use('/api/v1', createApiRouter(container));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}