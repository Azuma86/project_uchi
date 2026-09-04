import 'server-only';
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getEmulatorConfig, serverEnv } from '@/lib/env';
import { logger } from '@/lib/logging/logger';

/**
 * Firebase Admin SDK (サーバー専用) の初期化。
 *
 * 認証情報の決め方 — 本番で「鍵ファイルを置かない」ことが重要:
 *
 *  1. Cloud Run 上   : Application Default Credentials (ADC)。
 *                      Cloud Run のサービスアカウントが自動的に使われるため、
 *                      サービスアカウント JSON をイメージに含める必要がない。
 *                      鍵ファイルは漏洩すると失効させるまで悪用され続けるので、
 *                      そもそも「作らない・置かない」のが最も安全。
 *  2. ローカル(実DB) : `gcloud auth application-default login` で同じく ADC。
 *  3. ローカル(Emulator): 認証情報不要。projectId だけで動く。
 *  4. どうしても鍵が必要な場合のみ FIREBASE_SERVICE_ACCOUNT_JSON。
 *     (.gitignore 済み。CI では使わない)
 *
 * Admin SDK は Security Rules を「バイパス」する点に注意。
 * つまりサーバー側のコードでは、権限チェックを自分で必ず書く必要がある
 * (src/lib/permissions と src/lib/auth/session が担当)。
 */

const emulator = getEmulatorConfig();

function createApp(): App {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID ?? 'uchi-plus-demo';
  const storageBucket = process.env.GCS_BUCKET;

  if (emulator.enabled) {
    // Admin SDK は下記の環境変数を見て自動的にエミュレータへ接続する
    process.env.FIRESTORE_EMULATOR_HOST ||= emulator.firestoreHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= emulator.authHost;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= emulator.storageHost;
    logger.info('Firebase Admin: エミュレータへ接続します', {
      projectId,
      firestore: process.env.FIRESTORE_EMULATOR_HOST,
    });
    return initializeApp({ projectId, storageBucket: storageBucket ?? `${projectId}.appspot.com` });
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawServiceAccount) {
    logger.warn(
      'FIREBASE_SERVICE_ACCOUNT_JSON を使用しています。本番では ADC (Cloud Run のサービスアカウント) を使ってください。',
    );
    return initializeApp({
      credential: cert(JSON.parse(rawServiceAccount)),
      projectId,
      storageBucket,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
}

function getAdminApp(): App {
  const existing = getApps();
  return existing.length > 0 ? (existing[0] as App) : createApp();
}

/**
 * Firestore インスタンスは globalThis に保持する。
 *
 * 開発時のホットリロードではモジュールが再評価されるため、
 * モジュールスコープの変数だけだと「同じ Firestore に対して settings() を
 * 2 回呼ぶ」ことになり
 *   Firestore has already been initialized
 * というエラーになる。globalThis に置けばリロードをまたいで保持できる。
 */
const globalForFirestore = globalThis as typeof globalThis & {
  __uchiPlusFirestore?: Firestore;
};

/** Firestore (Admin)。Security Rules は適用されない。 */
export function getDb(): Firestore {
  if (globalForFirestore.__uchiPlusFirestore) {
    return globalForFirestore.__uchiPlusFirestore;
  }

  const db = getFirestore(getAdminApp());
  try {
    db.settings({
      // undefined のフィールドを書き込み時に無視する。
      // 「値が無い」を null と undefined で混在させないためのガード。
      ignoreUndefinedProperties: true,
    });
  } catch {
    // すでに設定済み (ホットリロード時) なら何もしない
  }

  globalForFirestore.__uchiPlusFirestore = db;
  return db;
}

/** Firebase Authentication (Admin)。ID トークン検証とセッション Cookie 発行に使う。 */
export function getAuthAdmin(): Auth {
  return getAuth(getAdminApp());
}

/** 写真・領収書を保存する Cloud Storage バケット */
export function getBucket() {
  return getStorage(getAdminApp()).bucket(serverEnv.storageBucket);
}

export const isEmulator = emulator.enabled;
