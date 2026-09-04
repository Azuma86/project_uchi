import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { albumDoc, albumsCol, photosCol } from '@/lib/data/paths';
import { num, str, strOrNull, tsToIso } from '@/lib/firebase/converters';
import type { Album } from '@/lib/types';
import { conflict, notFound } from '@/lib/errors';
import { getDb } from '@/lib/firebase/admin';

function toAlbum(id: string, familyId: string, data: FirebaseFirestore.DocumentData): Album {
  return {
    id,
    familyId,
    name: str(data.name, '(名称未設定)'),
    description: strOrNull(data.description),
    coverPhotoId: strOrNull(data.coverPhotoId),
    photoCount: num(data.photoCount, 0),
    createdBy: str(data.createdBy),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

export async function listAlbums(familyId: string): Promise<Album[]> {
  const snap = await albumsCol(familyId).orderBy('createdAt', 'desc').get();
  return snap.docs.map((doc) => toAlbum(doc.id, familyId, doc.data()));
}

export async function getAlbum(params: {
  familyId: string;
  albumId: string;
}): Promise<Album | null> {
  const snap = await albumDoc(params.familyId, params.albumId).get();
  if (!snap.exists) return null;
  return toAlbum(snap.id, params.familyId, snap.data() ?? {});
}

export async function createAlbum(params: {
  familyId: string;
  userId: string;
  name: string;
  description: string;
}): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const ref = await albumsCol(params.familyId).add({
    familyId: params.familyId,
    name: params.name,
    description: params.description || null,
    coverPhotoId: null,
    coverStoragePath: null,
    photoCount: 0,
    createdBy: params.userId,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateAlbum(params: {
  familyId: string;
  albumId: string;
  name: string;
  description: string;
}): Promise<void> {
  const ref = albumDoc(params.familyId, params.albumId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('アルバムが見つかりません。');
  await ref.update({
    name: params.name,
    description: params.description || null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * アルバムを削除する。中に写真が残っている場合は削除させない。
 * 「アルバムだけ消えて写真が孤立する」状態を避けるため。
 */
export async function deleteAlbum(params: { familyId: string; albumId: string }): Promise<void> {
  const db = getDb();
  const countSnap = await photosCol(params.familyId)
    .where('albumId', '==', params.albumId)
    .count()
    .get();
  if (countSnap.data().count > 0) {
    throw conflict('写真が残っているアルバムは削除できません。先に写真を移動または削除してください。');
  }
  await db.recursiveDelete(albumDoc(params.familyId, params.albumId));
}
