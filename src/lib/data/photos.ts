import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { albumDoc, photoDoc, photosCol } from '@/lib/data/paths';
import { num, numOrNull, str, strOrNull, tsToIso } from '@/lib/firebase/converters';
import type { Photo } from '@/lib/types';
import { notFound } from '@/lib/errors';
import { getDb } from '@/lib/firebase/admin';
import { deleteObject } from '@/lib/storage/gcs';
import { logger } from '@/lib/logging/logger';

/**
 * 写真のメタデータ。実体 (バイナリ) は Cloud Storage にあり、
 * Firestore にはパスと属性だけを持つ (docs/adr/003-storage.md 参照)。
 *
 * photos を albums のサブコレクションにしていない理由:
 *   - アルバム未分類の写真を扱いたい (albumId = null)
 *   - 「家族の全写真を日付順で見る」が最頻の操作で、
 *     サブコレクションだと collectionGroup クエリが必要になり
 *     Security Rules も書きにくくなる
 */

function toPhoto(id: string, familyId: string, data: FirebaseFirestore.DocumentData): Photo {
  return {
    id,
    familyId,
    albumId: strOrNull(data.albumId),
    storagePath: str(data.storagePath),
    thumbnailStoragePath: strOrNull(data.thumbnailStoragePath),
    caption: strOrNull(data.caption),
    takenAt: tsToIso(data.takenAt),
    width: numOrNull(data.width),
    height: numOrNull(data.height),
    byteSize: num(data.byteSize, 0),
    contentType: str(data.contentType, 'image/webp'),
    uploadedBy: str(data.uploadedBy),
    createdAt: tsToIso(data.createdAt),
  };
}

export async function listPhotos(params: {
  familyId: string;
  albumId?: string | null;
  limit?: number;
  /** 前ページの最後の takenAt (ISO)。ページングに使う。 */
  startAfterTakenAt?: string | null;
}): Promise<Photo[]> {
  let query = photosCol(params.familyId).orderBy('takenAt', 'desc');

  if (params.albumId) {
    query = photosCol(params.familyId)
      .where('albumId', '==', params.albumId)
      .orderBy('takenAt', 'desc');
  }
  if (params.startAfterTakenAt) {
    query = query.startAfter(Timestamp.fromDate(new Date(params.startAfterTakenAt)));
  }

  const snap = await query.limit(params.limit ?? 60).get();
  return snap.docs.map((doc) => toPhoto(doc.id, params.familyId, doc.data()));
}

export async function getPhoto(params: {
  familyId: string;
  photoId: string;
}): Promise<Photo | null> {
  const snap = await photoDoc(params.familyId, params.photoId).get();
  if (!snap.exists) return null;
  return toPhoto(snap.id, params.familyId, snap.data() ?? {});
}

export async function countPhotos(familyId: string): Promise<number> {
  const snap = await photosCol(familyId).count().get();
  return snap.data().count;
}

/**
 * アップロード完了後に写真を登録する。
 * アルバムの枚数とカバー写真も同じ batch で更新する (非正規化)。
 * 一覧表示のたびに写真を数え直すと read が増えるため。
 */
export async function createPhoto(params: {
  familyId: string;
  userId: string;
  albumId: string | null;
  storagePath: string;
  thumbnailStoragePath: string | null;
  caption: string;
  takenAt: Date;
  width: number | null;
  height: number | null;
  byteSize: number;
  contentType: string;
}): Promise<string> {
  const db = getDb();
  const photoRef = photosCol(params.familyId).doc();
  const batch = db.batch();

  batch.set(photoRef, {
    familyId: params.familyId,
    albumId: params.albumId,
    storagePath: params.storagePath,
    thumbnailStoragePath: params.thumbnailStoragePath,
    caption: params.caption || null,
    takenAt: Timestamp.fromDate(params.takenAt),
    width: params.width,
    height: params.height,
    byteSize: params.byteSize,
    contentType: params.contentType,
    uploadedBy: params.userId,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (params.albumId) {
    batch.update(albumDoc(params.familyId, params.albumId), {
      photoCount: FieldValue.increment(1),
      coverPhotoId: photoRef.id,
      coverStoragePath: params.thumbnailStoragePath ?? params.storagePath,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return photoRef.id;
}

export async function updatePhoto(params: {
  familyId: string;
  photoId: string;
  caption: string;
  albumId?: string | null;
}): Promise<void> {
  const ref = photoDoc(params.familyId, params.photoId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('写真が見つかりません。');

  const patch: Record<string, unknown> = { caption: params.caption || null };
  const previousAlbumId = strOrNull(snap.data()?.albumId);

  if (params.albumId !== undefined && params.albumId !== previousAlbumId) {
    patch.albumId = params.albumId;
    const db = getDb();
    const batch = db.batch();
    batch.update(ref, patch);
    if (previousAlbumId) {
      batch.update(albumDoc(params.familyId, previousAlbumId), {
        photoCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (params.albumId) {
      batch.update(albumDoc(params.familyId, params.albumId), {
        photoCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return;
  }

  await ref.update(patch);
}

/**
 * 写真を削除する。Firestore のドキュメントと Cloud Storage の実体の両方を消す。
 * 片方だけ消えると「孤児オブジェクト」が残って課金され続けるので注意。
 */
export async function deletePhoto(params: { familyId: string; photoId: string }): Promise<void> {
  const ref = photoDoc(params.familyId, params.photoId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('写真が見つかりません。');
  const data = snap.data() ?? {};
  const albumId = strOrNull(data.albumId);
  const storagePath = str(data.storagePath);
  const thumbnailStoragePath = strOrNull(data.thumbnailStoragePath);

  const db = getDb();
  const batch = db.batch();
  batch.delete(ref);
  if (albumId) {
    batch.update(albumDoc(params.familyId, albumId), {
      photoCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  // Storage の削除に失敗してもアプリは止めない (孤児はライフサイクルルールで回収)
  await Promise.all(
    [storagePath, thumbnailStoragePath].filter(Boolean).map(async (path) => {
      try {
        await deleteObject({ storagePath: path as string, familyId: params.familyId });
      } catch (error) {
        logger.error('Cloud Storage のオブジェクト削除に失敗しました', error, {
          familyId: params.familyId,
          action: 'photo.delete_object',
        });
      }
    }),
  );
}
