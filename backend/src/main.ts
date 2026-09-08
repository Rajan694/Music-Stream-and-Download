import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

const API_PREFIX = 'api/v1';
const FORCE_EXIT_MS = 10_000;

// Validated up front so a bad value fails at boot, not mid-request.
const env = loadEnv();
const container = createContainer(env);
const app = createApp(container);

const server = app.listen(env.API_PORT, () => {
  console.info(`API listening on http://localhost:${env.API_PORT}/${API_PREFIX}`);
});

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
