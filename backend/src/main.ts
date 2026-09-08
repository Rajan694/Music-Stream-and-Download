import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

const API_PREFIX = 'api/v1';
const FORCE_EXIT_MS = 10_000;
const MAX_PORT_RETRIES = 10;

// Validated up front so a bad value fails at boot, not mid-request.
const env = loadEnv();
const container = createContainer(env);
const app = createApp(container);

function listen(port: number, attemptsLeft: number): void {
  server = app.listen(port, () => {
    console.info(`API listening on http://localhost:${port}/${API_PREFIX}`);
  });

  // Fixed port mappings in prod (compose, nginx) make silently shifting the
  // port unsafe there — only retry in development, where it's just a
  // convenience against a stale process still holding the port.
  if (env.NODE_ENV !== 'production' && attemptsLeft > 0) {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is in use, retrying on ${port + 1}`);
        listen(port + 1, attemptsLeft - 1);
      } else {
        throw err;
      }
    });
  }
}

let server: ReturnType<typeof app.listen>;
listen(env.API_PORT, MAX_PORT_RETRIES);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}, shutting down`);

  // Backstop: if a socket refuses to drain we still exit rather than hang
  // until the orchestrator sends SIGKILL.
  const force = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, FORCE_EXIT_MS);
  force.unref();

  server.close();
  // SSE responses are long-lived by design and would otherwise keep
  // `server.close()` waiting forever.
  server.closeAllConnections();

  await container.shutdown();
  console.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
