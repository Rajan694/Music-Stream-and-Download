import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

/**
 * Walks up looking for the monorepo `.env`, so the worker picks up the same
 * file the backend does whether it is started from the repo root, from
 * `worker/`, or from a built `dist/`.
 *
 * This matters more than it looks: the backend enqueues to `REDIS_URL` and the
 * worker consumes from it. If only one of them reads `.env` they end up on
 * different Redis instances and every job silently disappears.
 */
function findRepoEnvFile(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 6; depth++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// Loaded as a module side effect. ESM evaluates imports in order, so importing
// this module first in main.ts guarantees the file is read before any later
// import can observe process.env. Real environment variables always win.
const envFile = findRepoEnvFile();
if (envFile) loadDotenv({ path: envFile, quiet: true });

export {};
