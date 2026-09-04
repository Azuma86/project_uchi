import type { UploadKind } from '@/lib/validation/upload';

/**
 * Cloud Storage のオブジェクトパス生成 / 検証 (純粋関数)。
 *
 * 重要な設計:
 *   パスは必ずサーバーが生成する。クライアントから受け取ったパスをそのまま
 *   使うと `families/<他人の家族ID>/...` を指定されて別家族のファイルを
 *   読み書きされる (IDOR)。
 *   そのため
 *     - アップロード時: サーバーが familyId + UUID で組み立てる
 *     - 参照時       : 「そのパスが自分の familyId 配下か」を必ず検証する
 *   の 2 点をこのモジュールで担保する。
 */

const FOLDER_BY_KIND: Record<UploadKind, string> = {
  photo: 'photos',
  thumbnail: 'thumbnails',
  receipt: 'receipts',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

export function extensionForMime(contentType: string): string {
  return EXTENSION_BY_MIME[contentType] ?? 'webp';
}

/** families/{familyId}/photos/{uuid}.webp */
export function buildStoragePath(params: {
  familyId: string;
  kind: UploadKind;
  contentType: string;
  objectId: string;
}): string {
  const folder = FOLDER_BY_KIND[params.kind];
  const ext = extensionForMime(params.contentType);
  return `families/${params.familyId}/${folder}/${params.objectId}.${ext}`;
}

/** そのパスが指定した家族のものかどうか (参照・削除の前に必ず確認する) */
export function isPathOwnedByFamily(storagePath: string, familyId: string): boolean {
  if (!storagePath || !familyId) return false;
  // パス・トラバーサルや二重スラッシュを弾く
  if (storagePath.includes('..') || storagePath.includes('//')) return false;
  return storagePath.startsWith(`families/${familyId}/`);
}

/** photos / thumbnails / receipts のいずれかであること */
export function pathKind(storagePath: string): UploadKind | null {
  const match = /^families\/[^/]+\/(photos|thumbnails|receipts)\//.exec(storagePath);
  if (!match) return null;
  const folder = match[1];
  if (folder === 'photos') return 'photo';
  if (folder === 'thumbnails') return 'thumbnail';
  if (folder === 'receipts') return 'receipt';
  return null;
}

export function assertPathShape(storagePath: string, familyId: string, kind?: UploadKind): void {
  if (!isPathOwnedByFamily(storagePath, familyId)) {
    throw new Error('storage path does not belong to the family');
  }
  const actual = pathKind(storagePath);
  if (!actual) throw new Error('unknown storage path kind');
  if (kind && actual !== kind) throw new Error('unexpected storage path kind');
}
