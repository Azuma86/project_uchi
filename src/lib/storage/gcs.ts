import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBucket, isEmulator } from '@/lib/firebase/admin';
import { serverEnv } from '@/lib/env';
import { forbidden, invalidInput, notFound } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import {
  ALLOWED_STORED_MIME,
  MAX_BYTES_BY_KIND,
  UPLOAD_URL_TTL_SECONDS,
  type UploadKind,
} from '@/lib/validation/upload';
import { buildStoragePath, isPathOwnedByFamily } from '@/lib/storage/paths';

/**
 * Cloud Storage とのやり取り。
 *
 * ■ バケットは非公開 (allUsers への公開を絶対に行わない)。
 *   代わりに「署名付き URL (Signed URL)」を使う。
 *   署名付き URL = 「このオブジェクトを、この操作で、この時刻まで許可する」
 *   という署名の入った URL。受け取った人は Google アカウント無しでアクセスできる。
 *
 * ■ アップロード経路 (なぜ Cloud Run を経由しないのか)
 *     ブラウザ → [Server Action] 署名付き PUT URL をもらう
 *            → ブラウザから GCS へ直接 PUT
 *            → [Server Action] Firestore にメタデータを登録
 *   Cloud Run を画像が通らないので、
 *     - Cloud Run の CPU/メモリ時間 (= 課金) を消費しない
 *     - Cloud Run のリクエストサイズ上限 (32MB) に縛られない
 *     - タイムアウトしにくい
 *   保存先パスはサーバーが決めるので、クライアントは任意の場所へ書けない。
 *
 * ■ 署名に必要な IAM
 *   ADC (Cloud Run のサービスアカウント) には秘密鍵が無いため、
 *   ライブラリは IAM Credentials API の signBlob を呼んで署名する。
 *   そのためサービスアカウント自身に
 *     roles/iam.serviceAccountTokenCreator
 *   が必要 (自分自身に対する権限)。加えて
 *     iamcredentials.googleapis.com を有効化しておくこと。
 *   詳細は README「Signed URL と IAM」を参照。
 */

/** 署名付き読み取り URL のメモリキャッシュ (同じ画像を何度も署名し直さない) */
type CacheEntry = { url: string; expiresAt: number };
const readUrlCache = new Map<string, CacheEntry>();
const READ_CACHE_MAX = 500;

function cacheGet(path: string): string | null {
  const hit = readUrlCache.get(path);
  if (!hit) return null;
  // 残り 60 秒を切ったら作り直す
  if (hit.expiresAt - Date.now() < 60_000) {
    readUrlCache.delete(path);
    return null;
  }
  return hit.url;
}

function cacheSet(path: string, url: string, ttlSeconds: number): void {
  if (readUrlCache.size >= READ_CACHE_MAX) {
    const oldest = readUrlCache.keys().next().value;
    if (oldest) readUrlCache.delete(oldest);
  }
  readUrlCache.set(path, { url, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export type UploadTarget = {
  /** ブラウザが PUT する先 */
  uploadUrl: string;
  /** Firestore に保存するパス */
  storagePath: string;
  /** PUT 時に必ず付けるヘッダ */
  headers: Record<string, string>;
  expiresAt: string;
};

/**
 * アップロード用の署名付き URL を発行する。
 * 呼び出し側で「その familyId に所属しているか」を検証済みであること。
 */
export async function createUploadTarget(params: {
  familyId: string;
  kind: UploadKind;
  contentType: string;
  byteSize: number;
}): Promise<UploadTarget> {
  if (!(ALLOWED_STORED_MIME as readonly string[]).includes(params.contentType)) {
    throw invalidInput('この形式の画像は保存できません。');
  }
  const max = MAX_BYTES_BY_KIND[params.kind];
  if (params.byteSize <= 0 || params.byteSize > max) {
    throw invalidInput(`ファイルサイズが大きすぎます (上限 ${Math.round(max / 1024 / 1024)}MB)。`);
  }

  // ファイル名は必ずサーバーで生成する。
  // 元のファイル名を使うと (1) 個人情報が漏れる (2) 上書きされる (3) 推測される
  const storagePath = buildStoragePath({
    familyId: params.familyId,
    kind: params.kind,
    contentType: params.contentType,
    objectId: randomUUID(),
  });

  const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);

  if (isEmulator) {
    // Storage エミュレータは署名付き URL に対応していないため、
    // 開発時だけアプリ内のアップロード用エンドポイントを経由する。
    return {
      uploadUrl: `/api/dev-upload?path=${encodeURIComponent(storagePath)}`,
      storagePath,
      headers: { 'Content-Type': params.contentType },
      expiresAt: expiresAt.toISOString(),
    };
  }

  const [uploadUrl] = await getBucket()
    .file(storagePath)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: params.contentType,
    });

  return {
    uploadUrl,
    storagePath,
    // 署名は Content-Type を含むので、PUT 時に同じ値を送らないと 403 になる
    headers: { 'Content-Type': params.contentType },
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * アップロード完了後の検証。
 * 「クライアントが申告したサイズ・形式」ではなく「GCS 上の実物」を見る。
 */
export async function verifyUploadedObject(params: {
  storagePath: string;
  familyId: string;
  kind: UploadKind;
}): Promise<{ byteSize: number; contentType: string }> {
  if (!isPathOwnedByFamily(params.storagePath, params.familyId)) {
    throw forbidden('保存先が正しくありません。');
  }

  const file = getBucket().file(params.storagePath);
  const [exists] = await file.exists();
  if (!exists) throw notFound('アップロードされたファイルが見つかりません。');

  const [metadata] = await file.getMetadata();
  const byteSize = Number(metadata.size ?? 0);
  const contentType = String(metadata.contentType ?? '');

  const max = MAX_BYTES_BY_KIND[params.kind];
  if (byteSize <= 0 || byteSize > max) {
    await file.delete({ ignoreNotFound: true });
    throw invalidInput('ファイルサイズが上限を超えています。');
  }
  if (!(ALLOWED_STORED_MIME as readonly string[]).includes(contentType)) {
    await file.delete({ ignoreNotFound: true });
    throw invalidInput('この形式の画像は保存できません。');
  }

  return { byteSize, contentType };
}

/**
 * 閲覧用の署名付き URL を発行する。
 * 呼び出し側で家族所属・権限 (領収書なら申請者本人か admin) を検証済みであること。
 */
export async function createReadUrl(params: {
  storagePath: string;
  familyId: string;
  ttlSeconds?: number;
}): Promise<string> {
  if (!isPathOwnedByFamily(params.storagePath, params.familyId)) {
    throw forbidden('このファイルにはアクセスできません。');
  }

  if (isEmulator) {
    return `/api/media?path=${encodeURIComponent(params.storagePath)}`;
  }

  const cached = cacheGet(params.storagePath);
  if (cached) return cached;

  const ttl = params.ttlSeconds ?? serverEnv.signedUrlTtlSeconds;
  const [url] = await getBucket()
    .file(params.storagePath)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: new Date(Date.now() + ttl * 1000),
    });

  cacheSet(params.storagePath, url, ttl);
  return url;
}

/** 複数パスの署名付き URL をまとめて発行 (アルバム一覧用) */
export async function createReadUrls(params: {
  storagePaths: (string | null | undefined)[];
  familyId: string;
}): Promise<Record<string, string>> {
  const unique = [...new Set(params.storagePaths.filter((p): p is string => Boolean(p)))];
  const entries = await Promise.all(
    unique.map(async (path) => {
      try {
        return [path, await createReadUrl({ storagePath: path, familyId: params.familyId })] as const;
      } catch (error) {
        logger.warn('署名付き URL の発行に失敗しました', {
          familyId: params.familyId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null));
}

/** オブジェクトを削除 (写真削除時など)。存在しなくてもエラーにしない。 */
export async function deleteObject(params: { storagePath: string; familyId: string }): Promise<void> {
  if (!isPathOwnedByFamily(params.storagePath, params.familyId)) {
    throw forbidden('このファイルは削除できません。');
  }
  readUrlCache.delete(params.storagePath);
  await getBucket().file(params.storagePath).delete({ ignoreNotFound: true });
}

/** 開発時 (エミュレータ) にブラウザから直接バイト列を受け取って保存する */
export async function saveObjectFromBuffer(params: {
  storagePath: string;
  familyId: string;
  contentType: string;
  buffer: Buffer;
}): Promise<void> {
  if (!isPathOwnedByFamily(params.storagePath, params.familyId)) {
    throw forbidden('保存先が正しくありません。');
  }
  await getBucket().file(params.storagePath).save(params.buffer, {
    contentType: params.contentType,
    resumable: false,
  });
}

/** 画像バイト列を取得 (エミュレータでの表示用) */
export async function downloadObject(params: {
  storagePath: string;
  familyId: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isPathOwnedByFamily(params.storagePath, params.familyId)) {
    throw forbidden('このファイルにはアクセスできません。');
  }
  const file = getBucket().file(params.storagePath);
  const [exists] = await file.exists();
  if (!exists) throw notFound('ファイルが見つかりません。');
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  return { buffer, contentType: String(metadata.contentType ?? 'application/octet-stream') };
}
