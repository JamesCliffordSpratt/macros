// Flat ESLint config (ESLint 9+).
// Runs the official Obsidian rules (eslint-plugin-obsidianmd, recommended)
// alongside the project's existing unused-imports and Prettier setup.
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  // Files ESLint should never look at.
  {
    ignores: [
      'node_modules/**',
      'main.js', // bundled build output
      'dist/**',
      'coverage/**',
      '**/*.config.{js,mjs,cjs}', // esbuild.config.mjs, this file, etc.
      'version-bump.mjs',
      'sync-version.js',
      'sentence-case-locale.js', // one-off helper script
      // Non-source JSON (only package.json is meant to be linted, by the
      // obsidianmd manifest/license rules). The rest are data/config files.
      'data.json',
      'manifest.json',
      'versions.json',
      'package-lock.json',
      'tsconfig*.json',
    ],
  },

  // Official Obsidian recommended ruleset. Includes the typescript-eslint
  // type-checked rules and @typescript-eslint/no-deprecated.
  ...obsidianmd.configs.recommended,

  // The recommended config applies some type-aware rules globally (e.g.
  // no-plugin-as-component), which breaks on non-TS files like package.json
  // that have no type info. Turn the type-requiring rules off for those.
  {
    files: ['**/*.json', '**/*.{js,cjs,mjs,jsx}'],
    rules: {
      'obsidianmd/no-plugin-as-component': 'off',
      'obsidianmd/no-view-references-in-plugin': 'off',
      'obsidianmd/no-unsupported-api': 'off',
      'obsidianmd/prefer-file-manager-trash-file': 'off',
      'obsidianmd/prefer-instanceof': 'off',
      // Type-aware TS rule; can't run on plain JS files (no tsconfig project).
      '@typescript-eslint/no-deprecated': 'off',
    },
  },

  // The type-checked rules need type information. The modern project service
  // points the parser at the nearest tsconfig and tolerates stray files.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Project extras (previously in .eslintrc): auto-remove unused imports/vars.
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      // Defer to the unused-imports plugin to avoid duplicate reports.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Lint the English locale source for sentence-case UI strings. The
  // recommended config can't see these (they go through t()), so enable the
  // locale-module rule on en.ts only (other locales aren't English prose).
  {
    files: ['**/en.ts'],
    rules: { 'obsidianmd/ui/sentence-case-locale-module': 'warn' },
  },

  // Prettier last, so it disables formatting rules that would conflict.
  prettierRecommended,
];
