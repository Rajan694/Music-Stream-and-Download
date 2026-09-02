import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { allowAnyIn, baseConfig } from '@music/config/eslint/base';

/**
 * Single flat config for the whole monorepo.
 *
 * ESLint 9 resolves a config by walking up from the working directory, so this
 * one file serves both `npm run lint -w <workspace>` and a run from the repo
 * root. The root run is what matters for the pre-commit hook: lint-staged
 * invokes `eslint` from the root, and with only per-workspace configs that run
 * failed with "couldn't find an eslint.config file" and blocked every commit.
 *
 * `files` patterns resolve relative to this file, so every override is written
 * as a repo-root path.
 */
const WEB = ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'];

// Absolute: the Next plugin resolves this itself rather than against cwd, which
// differs between a root run and a per-workspace run.
const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'apps/web');

/** Scopes a shared config array to one workspace. */
const scopeTo = (files, configs) =>
  configs.map((config) => ({
    ...config,
    files: config.files ?? files,
  }));

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/coverage/**',
    '**/src/generated/**',
    '**/*.tsbuildinfo',
    '**/next-env.d.ts',
  ]),

  // Node/TypeScript workspaces.
  ...baseConfig,

  // Provider adapters map untyped upstream payloads; every result is validated
  // by a Zod schema before it leaves the provider.
  allowAnyIn(['apps/api/src/media/providers/**/*.ts']),
  // The worker pipeline parses raw yt-dlp JSON — same boundary rationale.
  allowAnyIn(['apps/worker/src/pipeline/**/*.ts']),

  // Next.js rules apply to the web app only; unscoped they would fire React
  // and JSX rules at the API and worker sources.
  ...scopeTo(WEB, [...nextVitals, ...nextTs]),
  {
    files: WEB,
    // The plugin resolves the app on disk; in a root-level run cwd is the repo
    // root rather than the web workspace.
    //
    // `eslint-config-next` still prints "Pages directory cannot be found" to
    // stderr during a root run — it probes for a Pages Router app while loading,
    // before any rule or setting applies. It is noise, not a failure: the run
    // exits 0 and the pre-commit hook passes.
    settings: { next: { rootDir: WEB_ROOT } },
  },
]);
