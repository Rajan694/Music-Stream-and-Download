// Flat config base shared by every workspace.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Paths no workspace should ever lint. */
export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/src/generated/**',
    '**/*.tsbuildinfo',
  ],
};

/** @type {import('eslint').Linter.Config[]} */
export const baseConfig = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-var': 'error',
      'prefer-const': 'error',
      // The base rule misfires on TypeScript constructs; the typed variant wins.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

/**
 * Provider adapters and other boundaries deliberately handle untyped payloads,
 * so `any` is allowed where a schema validates the result immediately after.
 */
export const allowAnyIn = (files) => ({
  files,
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
});

export default baseConfig;
