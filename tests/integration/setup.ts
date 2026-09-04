/**
 * 統合テストの共通セットアップ。
 * Firebase Emulator に接続するための環境変数を、テスト実行前に設定する。
 */
process.env.FIREBASE_PROJECT_ID = 'uchi-plus-demo';
process.env.GCP_PROJECT_ID = 'uchi-plus-demo';
process.env.GCS_BUCKET = 'uchi-plus-demo.appspot.com';
process.env.USE_FIREBASE_EMULATORS = 'true';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
process.env.LOG_LEVEL = 'error';
