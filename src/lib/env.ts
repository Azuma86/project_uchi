import 'server-only';

/**
 * 環境変数の読み取りを 1 箇所に集約する。
 *
 * 設計方針:
 *  1. 環境依存値をコードへ直接書かない (dev / staging / prod を別 GCP Project に
 *     分けられるようにするため)。
 *  2. Firebase の「クライアント公開設定」と「秘密情報」を型レベルで分ける。
 *     - 公開設定 (apiKey など) はブラウザに配っても問題ない。
 *       アクセス制御は Firestore / Storage の Security Rules が担う。
 *     - 秘密情報 (LINE のトークンなど) は Secret Manager から Cloud Run の
 *       環境変数へ注入し、サーバー側だけで読む。
 *  3. NEXT_PUBLIC_* を使わない。
 *     NEXT_PUBLIC_* は `next build` 時に JS バンドルへ焼き込まれるため、
 *     環境ごとに Docker イメージを作り直す必要が出てしまう。
 *     本アプリは「同じイメージを dev → staging → prod へ昇格させる」ため、
 *     クライアント設定もサーバーの実行時 env から読み、Server Component 経由で
 *     ブラウザへ渡す (src/lib/firebase/client-config.ts)。
 */

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export type EmulatorConfig = {
  enabled: boolean;
  authHost: string;
  firestoreHost: string;
  storageHost: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.local (ローカル) または Cloud Run のリビジョン設定を確認してください。`,
    );
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/** ビルド時 (next build) は env が無くても落ちないようにするためのフラグ */
export const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

export function getEmulatorConfig(): EmulatorConfig {
  return {
    enabled: process.env.USE_FIREBASE_EMULATORS === 'true',
    authHost: optional('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099'),
    firestoreHost: optional('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'),
    storageHost: optional('FIREBASE_STORAGE_EMULATOR_HOST', '127.0.0.1:9199'),
  };
}

export function getFirebaseClientConfig(): FirebaseClientConfig {
  return {
    apiKey: required('FIREBASE_API_KEY'),
    authDomain: required('FIREBASE_AUTH_DOMAIN'),
    projectId: required('FIREBASE_PROJECT_ID'),
    storageBucket: required('GCS_BUCKET'),
    messagingSenderId: optional('FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('FIREBASE_APP_ID'),
  };
}

export const serverEnv = {
  /** GCP プロジェクト ID。Cloud Run 上では通常 FIREBASE_PROJECT_ID と同じ。 */
  get gcpProjectId(): string {
    return process.env.GCP_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? '';
  },
  /** 写真・領収書を保存する Cloud Storage バケット名 (公開バケットにしないこと) */
  get storageBucket(): string {
    return required('GCS_BUCKET');
  },
  /** アプリの公開 URL。メールリンク認証のリダイレクト先などに使う。 */
  get appUrl(): string {
    return optional('APP_URL', 'http://localhost:3000');
  },
  /** セッション Cookie の有効期間 (秒)。既定 5 日。 */
  get sessionMaxAgeSeconds(): number {
    const raw = Number(process.env.SESSION_COOKIE_MAX_AGE_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? raw : 60 * 60 * 24 * 5;
  },
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? 'development';
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  /** 通知の実装切り替え: 'noop' | 'console' | 'line' */
  get notificationDriver(): string {
    return optional('NOTIFICATION_DRIVER', 'console');
  },
  /** OCR の実装切り替え: 'dummy' | 'vision' */
  get ocrDriver(): string {
    return optional('OCR_DRIVER', 'dummy');
  },
  /** 署名付き URL の有効期間 (秒)。短いほど漏洩時の被害が小さい。 */
  get signedUrlTtlSeconds(): number {
    const raw = Number(process.env.SIGNED_URL_TTL_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? raw : 60 * 15;
  },
  get logLevel(): string {
    return optional('LOG_LEVEL', 'info');
  },
};
