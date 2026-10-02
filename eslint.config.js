import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'bin'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(app|features|game|i18n|design-system|shared)(/|$)',
              message:
                'Shared UI hooks must not depend on application or feature modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/design-system/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(app|features|game|shared)(/|$)',
              message:
                'Design system components must not import app, feature, game or shared-contract modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)app(/|$)',
              message: 'Features must not depend on the application shell.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(app|features|design-system)(/|$)',
              message:
                'Game modules must not depend on the application shell, features or design system.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)src(/|$)',
              message:
                'The shared game contract must not depend on frontend modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.js', '*.ts', 'tests/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
