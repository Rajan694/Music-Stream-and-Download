import { defineConfig, globalIgnores } from 'eslint/config';
import { allowAnyIn, baseConfig } from '@music/config/eslint/base';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/build/**',
    '**/coverage/**',
    '**/src/generated/**',
    '**/*.tsbuildinfo',
    'frontend/web/**',
  ]),

  ...baseConfig,

  // The logger module is the one sanctioned console boundary: wrapping
  // console is its entire job, so the rule that pushes everything else
  // through it cannot apply here.
  {
    files: ['backend/src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  allowAnyIn(['backend/src/media/providers/**/*.ts']),
  allowAnyIn(['worker/src/pipeline/**/*.ts']),
]);