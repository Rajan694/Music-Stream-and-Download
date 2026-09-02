import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * `youtube-dl-exec` vendors an official standalone yt-dlp build (no Python
 * runtime required), which keeps the binary pinned in the lockfile. A
 * system-installed yt-dlp still wins when `YT_DLP_PATH` is set — worth doing in
 * production, where extraction breaks unless the binary is updated often.
 */
function vendoredYtDlpPath(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve('youtube-dl-exec/package.json');
    const binary = join(dirname(pkg), 'bin', 'yt-dlp');
    if (existsSync(binary)) return binary;
  } catch {
    // Fall through to PATH lookup.
  }
  return 'yt-dlp';
}

/**
 * Walks up from this file looking for a `.env`, so the API picks up the
 * monorepo-root file whether it is started from the repo root, from
 * `apps/api`, or from a built `dist/`.
 */
function findRepoEnvFile(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 6; depth++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * `.env` files carry empty placeholders (`PIPED_API_URL=`). Treat those as
 * unset so schema defaults apply instead of failing validation.
 */
function withoutBlanks(
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value === '' ? undefined : value,
    ]),
  );
}

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  PIPED_API_URL: z.url().default('https://pipedapi.kavin.rocks'),
  PIPED_FALLBACK_URLS: z.string().default(''),

  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  PROVIDER_RETRIES: z.coerce.number().int().nonnegative().default(2),
  PROVIDER_DEADLINE_MS: z.coerce.number().int().positive().default(20000),

  YT_DLP_PATH: z.string().default(vendoredYtDlpPath()),
  YT_DLP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  CACHE_SEARCH_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60_000),
  CACHE_VIDEO_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),
  CACHE_PLAYLIST_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(1000),

  // Auth
  //
  // No fallback value. A shipped default secret is a public secret: anyone can
  // mint a token that the API accepts, so an unset variable must stop the boot
  // rather than silently downgrade authentication. `NODE_ENV` is checked below
  // to allow a generated throwaway secret in development only.
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default('http://localhost:4000/api/v1/auth/google/callback'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

export type Env = Omit<
  z.infer<typeof EnvSchema>,
  'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'
> & {
  corsOrigins: string[];
  pipedFallbackUrls: string[];
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
};

/**
 * Outside production a missing secret becomes a random per-boot value: local
 * development keeps working, and because it changes on restart nobody can grow
 * used to it. Production refuses to start.
 */
function requireSecret(
  value: string | undefined,
  name: string,
  isProduction: boolean,
): string {
  if (value) return value;
  if (isProduction) {
    throw new Error(
      `${name} must be set (min 32 characters). Generate one with: openssl rand -base64 48`,
    );
  }
  return randomBytes(48).toString('base64');
}

let cached: Env | undefined;

/**
 * Loads and validates process env once. Invalid values fail at boot rather
 * than at the first request that happens to read them.
 */
export function loadEnv(): Env {
  if (cached) return cached;

  const envFile = findRepoEnvFile();
  if (envFile) loadDotenv({ path: envFile, quiet: true });

  const parsed = EnvSchema.safeParse(withoutBlanks(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }

  const isProduction = parsed.data.NODE_ENV === 'production';

  cached = {
    ...parsed.data,
    corsOrigins: csv(parsed.data.CORS_ORIGINS),
    pipedFallbackUrls: csv(parsed.data.PIPED_FALLBACK_URLS),
    JWT_ACCESS_SECRET: requireSecret(
      parsed.data.JWT_ACCESS_SECRET,
      'JWT_ACCESS_SECRET',
      isProduction,
    ),
    JWT_REFRESH_SECRET: requireSecret(
      parsed.data.JWT_REFRESH_SECRET,
      'JWT_REFRESH_SECRET',
      isProduction,
    ),
  };
  return cached;
}
