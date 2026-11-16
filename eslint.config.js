import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'design', 'docs', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    // noUncheckedIndexedAccess already forces a decision at every lookup; a
    // deliberate `!` after it is allowed.
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['tools/**/*.{mjs,ts}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Core logic has no UI code and never sees a provider or the renderer.
  {
    files: ['core/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/app/**', '**/layers/**', '**/render/**', '**/adapters/**'], message: 'core must not import UI, layers, renderer or adapters.' },
          { group: ['maplibre-gl', 'pmtiles', '@openmeteo/*'], message: 'core must not import map or provider libraries.' },
        ],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
    },
  },
  // The GPL-2.0 starter library is only reachable through render/.
  {
    files: ['app/**/*.ts', 'layers/**/*.ts', 'adapters/**/*.ts', 'core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@openmeteo/weather-map-layer'], message: 'Only render/ may import the starter weather library (rendering seam).' },
        ],
      }],
    },
  },
  // Layers never import each other.
  {
    files: ['layers/**/*.ts'],
    ignores: ['layers/contract.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          // The one shared file is the template every layer fills (layers/contract.ts).
          { regex: '^\\.\\./(?!\\.\\.|contract$)|/layers/(?!contract$)', message: 'Layers never import each other; go through core.' },
          { group: ['@openmeteo/weather-map-layer'], message: 'Only render/ may import the starter weather library.' },
        ],
      }],
    },
  },
);
