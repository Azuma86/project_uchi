/**
 * アップロードの制限値。クライアントとサーバーの両方から参照する。
 *
 * サーバー側でも必ず検証する理由:
 *   ブラウザの JS はユーザーが自由に書き換えられるため、
 *   「クライアントで圧縮したから安全」は成立しない。
 *   署名付き URL を発行する前 (サイズ・Content-Type の申告値) と、
 *   アップロード完了後 (GCS 上の実際のメタデータ) の 2 回チェックする。
 */

/** ユーザーが選択できる元ファイルの形式 */
export const ACCEPTED_INPUT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
] as const;

/** <input accept="..."> 用 */
export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif';

/** Cloud Storage に保存してよい形式 (ブラウザで変換した後の形式) */
export const ALLOWED_STORED_MIME = ['image/webp', 'image/jpeg'] as const;
export type StoredMime = (typeof ALLOWED_STORED_MIME)[number];

/** 選択できる元ファイルの上限 (スマホの写真は 3〜8MB 程度) */
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;

/** 圧縮後に GCS へ送ってよい上限 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 512 * 1024;
export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;

/** 一度にアップロードできる枚数 (Cloud Run の同時リクエストを抑えるため) */
export const MAX_BATCH_UPLOAD = 20;

/** クライアント側での縮小設定 */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.82;
export const THUMBNAIL_MAX_EDGE = 400;
export const THUMBNAIL_QUALITY = 0.7;
/** 領収書は文字が読めればよいので写真より小さく */
export const RECEIPT_MAX_EDGE = 1400;
export const RECEIPT_QUALITY = 0.8;

export type UploadKind = 'photo' | 'thumbnail' | 'receipt';

export const MAX_BYTES_BY_KIND: Record<UploadKind, number> = {
  photo: MAX_PHOTO_BYTES,
  thumbnail: MAX_THUMBNAIL_BYTES,
  receipt: MAX_RECEIPT_BYTES,
};

/** 署名付きアップロード URL の有効期間 (秒)。短くして悪用の窓を狭める。 */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
