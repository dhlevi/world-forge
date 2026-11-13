// Linting for the whole repository (npm run lint): typescript-eslint's recommended rules, Vue's
// essential rules, and a few rules that need the types, chiefly that no promise is left unhandled
// (app/errors.ts has `background()` for work that runs on its own).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

/** Every TypeScript project in the repository, so that the rules that need types can see them. */
const projects = [
  'packages/core/tsconfig.json',
  'packages/core/tsconfig.scripts.json',
  'apps/atlas/tsconfig.json',
  'apps/atlas/tsconfig.node.json',
  'apps/game/tsconfig.json',
  'apps/game/tsconfig.node.json',
  'apps/game/tsconfig.scripts.json',
  'apps/desktop/tsconfig.json',
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', 'backups/**', 'apps/desktop/renderer/**', '**/tuning/data/**', 'Claude outputs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{ts,cts,mts,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        project: projects,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Promises: awaited, returned, or handed to background(); never dropped.
      // Vue's nextTick and MapLibre's setData give promises that cannot fail in any useful way.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', name: 'nextTick', package: 'vue' },
            { from: 'package', name: 'nextTick', package: '@vue/runtime-core' },
            { from: 'package', name: 'setData', package: 'maplibre-gl' },
          ],
        },
      ],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      // The compiler already reports unused names (noUnusedLocals); a leading _ marks one kept on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // `k ? g.lineTo(x, y) : g.moveTo(x, y)` is used for drawing paths.
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
      // A destructured pair stays `let` when either part changes.
      'prefer-const': ['error', { destructuring: 'all' }],
      // TypeScript checks these itself.
      'no-undef': 'off',
      'no-redeclare': 'off',
      // Short names for views are the house style (PlayView, TravelView).
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // The constants are kept digit for digit as in fdlibm, from which the deterministic maths is taken.
    files: ['packages/core/src/dmath.ts'],
    rules: { 'no-loss-of-precision': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
