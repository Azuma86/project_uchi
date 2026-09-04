import { readExifDateTaken } from '@/lib/images/exif';
import {
  MAX_SOURCE_FILE_BYTES,
  PHOTO_MAX_EDGE,
  PHOTO_QUALITY,
  RECEIPT_MAX_EDGE,
  RECEIPT_QUALITY,
  THUMBNAIL_MAX_EDGE,
  THUMBNAIL_QUALITY,
} from '@/lib/validation/upload';

/**
 * ブラウザ側の画像処理。
 *
 * なぜサーバーではなくブラウザで縮小するのか:
 *   1. 通信量が減る (スマホの写真 5MB -> 300KB 程度)
 *   2. Cloud Run の CPU 時間を使わない = 課金が増えない
 *   3. Cloud Storage の保存容量が減る = 保存料金が下がる
 *   4. アップロードが速く、失敗しにくい
 *
 * 副次的な効果として、Canvas で再エンコードするため
 * EXIF (GPS 座標など) がすべて除去される。
 * 撮影日時だけは変換前に読み出して保持する。
 *
 * HEIC (iPhone の標準形式) について:
 *   iOS Safari は OS のデコーダを使うため createImageBitmap で読める。
 *   読めない環境ではエラーメッセージを出して JPEG での再選択を促す。
 */

export type ProcessedImage = {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
};

export type ProcessedPhoto = {
  full: ProcessedImage;
  thumbnail: ProcessedImage;
  takenAt: Date;
  originalName: string;
};

let webpSupport: boolean | null = null;

/** ブラウザが WebP エンコードに対応しているか (未対応なら JPEG にフォールバック) */
async function supportsWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.8),
    );
    webpSupport = blob?.type === 'image/webp';
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

function computeSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<ProcessedImage> {
  const { width, height } = computeSize(bitmap.width, bitmap.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像の変換に失敗しました (Canvas を利用できません)。');

  // 縮小時の画質を上げる
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  const useWebp = await supportsWebp();
  const contentType = useWebp ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, contentType, quality),
  );
  if (!blob) throw new Error('画像の変換に失敗しました。');

  return { blob, contentType, width, height };
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // imageOrientation: 'from-image' で EXIF の回転情報を反映してから描画する
    // (これをしないと iPhone の縦写真が横向きで保存される)
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      'この画像を読み込めませんでした。JPEG または PNG で保存し直してからお試しください。',
    );
  }
}

/** アルバム用: 表示用の縮小版とサムネイルの 2 つを作る */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  assertSize(file);
  const takenAt = (await readExifDateTaken(file)) ?? new Date(file.lastModified || Date.now());
  const bitmap = await decode(file);
  try {
    const full = await encode(bitmap, PHOTO_MAX_EDGE, PHOTO_QUALITY);
    const thumbnail = await encode(bitmap, THUMBNAIL_MAX_EDGE, THUMBNAIL_QUALITY);
    return { full, thumbnail, takenAt, originalName: file.name };
  } finally {
    bitmap.close();
  }
}

/** 領収書用: 文字が読めればよいので 1 枚だけ、写真より小さめに */
export async function processReceipt(file: File): Promise<ProcessedImage> {
  assertSize(file);
  const bitmap = await decode(file);
  try {
    return await encode(bitmap, RECEIPT_MAX_EDGE, RECEIPT_QUALITY);
  } finally {
    bitmap.close();
  }
}

function assertSize(file: File): void {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(
      `ファイルが大きすぎます (${Math.round(file.size / 1024 / 1024)}MB)。${Math.round(
        MAX_SOURCE_FILE_BYTES / 1024 / 1024,
      )}MB 以下の画像を選んでください。`,
    );
  }
  if (file.size === 0) {
    throw new Error('ファイルを読み込めませんでした。');
  }
}
