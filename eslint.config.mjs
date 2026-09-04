import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint のフラット設定。
 * eslint-config-next 16 はフラット設定の配列をそのまま export しているので、
 * FlatCompat を経由せずに展開できる。
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/sw.js',
      'infra/**',
      '.emulator-data/**',
      'scripts/generate-icons.mjs',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 写真は Cloud Storage の署名付き URL から配信するため next/image は使わない
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
