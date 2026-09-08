import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { allowAnyIn, baseConfig } from '@music/config/eslint/base';

const FRONTEND = ['frontend/**/*.{ts,tsx,js,jsx,mjs}'];

const scopeTo = (files, configs) =>
  configs.map((config) => ({
    ...config,
    files: config.files ?? files,
  }));

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/build/**',
    '**/coverage/**',
    '**/src/generated/**',
    '**/*.tsbuildinfo',
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

  ...scopeTo(FRONTEND, [
    { plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh } },
    { rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': 'warn' } },
  ]),
]);