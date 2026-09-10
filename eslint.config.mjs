import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'assets/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/src/generated/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
    plugins: { '@next/next': next, 'react-hooks': reactHooks },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
    settings: { next: { rootDir: 'apps/web/' } },
  },
  prettier,
];
