import js from '@eslint/js';
import globals from 'globals';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: ['node_modules/**', 'assets/**', 'icons/**', 'dist/**', '.claude/**', 'recovered_code/**', 'test/e2e/report/**', 'ATH-PRO vanilla google/**', 'js/_archive/**', 'search_logs.js', 'search_content.js', 'rebuild_shared.js', 'extract_athlete_room.js', 'recover.js'],
  },
  js.configs.recommended,
  {
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['server.js', 'routes/**/*.js', 'lib/**/*.js', 'scripts/**/*.js', '*.js'],
    ignores: ['js/**', 'sw.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
    },
  },
  {
    files: ['test/**/*.js', 'playwright.config.js'],
    ignores: ['test/e2e/report/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-useless-assignment': 'off',
      'no-empty': 'off',
    },
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.serviceworker,
      },
    },
  },
];
