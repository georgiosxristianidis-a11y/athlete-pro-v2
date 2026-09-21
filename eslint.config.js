import js from '@eslint/js';
import globals from 'globals';
import pluginSecurity from 'eslint-plugin-security';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  pluginSecurity.configs.recommended,
  {
    ignores: ['node_modules/**', 'assets/**', 'icons/**', 'dist/**', '.claude/**', 'recovered_code/**', 'test/e2e/report/**', 'ATH-PRO vanilla google/**', 'js/_archive/**', 'search_logs.js', 'search_content.js', 'rebuild_shared.js', 'extract_athlete_room.js', 'recover.js', 'add_crop.js', 'add_crop.cjs', 'fix_escape.js', 'debug_line.js', 'phase*.js', 'purge_*.js'],
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
    files: ['server.js', 'routes/**/*.js', 'lib/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', '*.js'],
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
    // Playwright-скрипты: Node-код, внутри которого живут page.evaluate()-колбэки,
    // исполняемые в браузере. Тот же класс, что test/** и playwright.config.js.
    files: ['scripts/profile.mjs', 'scripts/compare-bundle.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
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

  // --- SAST: границы шума --------------------------------------------------
  // eslint-plugin-security давал 344 предупреждения при нуле ошибок, из них 240 —
  // detect-object-injection на обычной индексации своими же ключами в UI-коде.
  // Предупреждение, которое никто не читает, — не контроль, а фон, в котором
  // тонет сигнал (57 no-unused-vars лежали там же). Правило снято там, где
  // срабатывание структурно ложное, и оставлено там, где данные пересекают
  // границу доверия. Порядок блоков значим: сначала снимаем, потом возвращаем.
  // Интент сторожит test/eslint-config-scope.test.js.
  {
    files: ['js/**/*.js', 'test/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', 'sw.js'],
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
  {
    // Граница доверия на клиенте: слияние реплик и импорт бэкапа принимают
    // данные извне. Защита от Prototype Pollution здесь структурная (Map +
    // числовые индексы + IDB-ключи, docs/THREAT_MODEL.md), и любое новое
    // обращение по строковому ключу в этих файлах обязано быть прочитано глазом.
    files: ['js/shared/sync-merge.js', 'js/shared/integrity.js', 'js/db/backup.js'],
    rules: {
      'security/detect-object-injection': 'warn',
    },
  },
  {
    // Инструментарий и тесты читают файлы репозитория по построению: путь
    // собирается из имени каталога или теста, а не из пользовательского ввода.
    // На серверном рантайме (server.js, routes/, lib/) правила остаются.
    files: ['scripts/**/*.js', 'scripts/**/*.mjs', 'test/**/*.js'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
];
