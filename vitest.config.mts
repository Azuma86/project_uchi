import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        // ピュアなロジック (日時変換 / バリデーション / 権限判定) の単体テスト。
        // 外部サービスに一切アクセスしないので CI で常に実行できる。
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          // 本番 (Cloud Run) も CI も UTC で動く。ローカルの JST のまま流すと
          // タイムゾーン依存のバグを取り逃がすので、実行時刻帯を揃えておく。
          env: { TZ: 'UTC' },
        },
      },
      {
        // データ層の統合テスト (Firestore エミュレータに実際に読み書きする)。
        // トランザクションや非正規化の整合性など、モックでは検証できない部分を確認する。
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            // Next.js の外で実行するため server-only を無効化する
            'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
          },
        },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['./tests/integration/setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
      {
        // Firestore Security Rules のテスト。
        // Firebase Emulator Suite が必要なため `npm run test:rules` から起動する。
        test: {
          name: 'rules',
          environment: 'node',
          include: ['tests/rules/**/*.test.ts'],
          testTimeout: 20_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
