'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireFamilyAccess } from '@/lib/auth/session';
import { verifyUploadedObject } from '@/lib/storage/gcs';
import {
  createAlbumSchema,
  deleteAlbumSchema,
  deletePhotoSchema,
  finalizePhotoSchema,
  updateAlbumSchema,
  updatePhotoSchema,
} from '@/lib/validation/schemas';
import { field, toFormState, type FormState } from '@/lib/actions';
import { createAlbum, deleteAlbum, getAlbum, updateAlbum } from '@/lib/data/albums';
import { createPhoto, deletePhoto, getPhoto, updatePhoto } from '@/lib/data/photos';
import { canDeleteAlbum, canDeletePhoto, canEditPhoto } from '@/lib/permissions';
import { forbidden, invalidInput, notFound } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { isPathOwnedByFamily } from '@/lib/storage/paths';
import type { ActionResult } from '@/lib/errors';
import { actionError, actionOk } from '@/lib/errors';

/**
 * アルバム / 写真の Server Action。
 *
 * アップロードは 3 ステップ:
 *   1. requestUploadTargetAction  … 署名付き PUT URL を発行 (パスはサーバーが決める)
 *   2. ブラウザが Cloud Storage へ直接 PUT
 *   3. finalizePhotoAction        … 実物を検証してから Firestore にメタデータを登録
 *
 * 2 でブラウザが GCS と直接やり取りするので、画像が Cloud Run を通らない。
 */

/** アップロード完了後に Firestore へ登録する */
export async function finalizePhotoAction(input: {
  familyId: string;
  albumId: string | null;
  storagePath: string;
  thumbnailStoragePath: string | null;
  caption: string;
  takenAt: string;
  width: number | null;
  height: number | null;
}): Promise<ActionResult<{ photoId: string }>> {
  try {
    const parsed = finalizePhotoSchema.safeParse(input);
    if (!parsed.success) {
      throw invalidInput(parsed.error.issues[0]?.message ?? '写真の登録に失敗しました。');
    }

    const session = await requireFamilyAccess(parsed.data.familyId);

    // パスが自分の家族のものか (スキーマの正規表現に加えて実 ID でも確認)
    if (!isPathOwnedByFamily(parsed.data.storagePath, session.familyId)) {
      throw forbidden('保存先が正しくありません。');
    }

    // クライアントの申告ではなく Cloud Storage 上の実物を検証する
    const meta = await verifyUploadedObject({
      storagePath: parsed.data.storagePath,
      familyId: session.familyId,
      kind: 'photo',
    });

    let thumbnailStoragePath: string | null = null;
    if (parsed.data.thumbnailStoragePath) {
      if (!isPathOwnedByFamily(parsed.data.thumbnailStoragePath, session.familyId)) {
        throw forbidden('保存先が正しくありません。');
      }
      await verifyUploadedObject({
        storagePath: parsed.data.thumbnailStoragePath,
        familyId: session.familyId,
        kind: 'thumbnail',
      });
      thumbnailStoragePath = parsed.data.thumbnailStoragePath;
    }

    // アルバム指定がある場合、その家族のアルバムであることを確認する
    if (parsed.data.albumId) {
      const album = await getAlbum({ familyId: session.familyId, albumId: parsed.data.albumId });
      if (!album) throw notFound('アルバムが見つかりません。');
    }

    const takenAt = parsed.data.takenAt ? new Date(parsed.data.takenAt) : new Date();

    const photoId = await createPhoto({
      familyId: session.familyId,
      userId: session.userId,
      albumId: parsed.data.albumId ?? null,
      storagePath: parsed.data.storagePath,
      thumbnailStoragePath,
      caption: parsed.data.caption ?? '',
      takenAt: Number.isNaN(takenAt.getTime()) ? new Date() : takenAt,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      byteSize: meta.byteSize,
      contentType: meta.contentType,
    });

    logger.info('写真を登録しました', {
      userId: session.userId,
      familyId: session.familyId,
      action: 'photo.create',
      byteSize: meta.byteSize,
    });

    revalidatePath('/album');
    revalidatePath('/home');
    return actionOk({ photoId });
  } catch (error) {
    return actionError(error);
  }
}

export async function createAlbumAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let albumId = '';
  try {
    const parsed = createAlbumSchema.safeParse({
      familyId: field(formData, 'familyId'),
      name: field(formData, 'name'),
      description: field(formData, 'description'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    albumId = await createAlbum({
      familyId: session.familyId,
      userId: session.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? '',
    });
  } catch (error) {
    return toFormState(error, { action: 'album.create' });
  }

  revalidatePath('/album');
  redirect(`/album/${albumId}`);
}

export async function updateAlbumAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const parsed = updateAlbumSchema.safeParse({
      familyId: field(formData, 'familyId'),
      albumId: field(formData, 'albumId'),
      name: field(formData, 'name'),
      description: field(formData, 'description'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    await updateAlbum({
      familyId: session.familyId,
      albumId: parsed.data.albumId,
      name: parsed.data.name,
      description: parsed.data.description ?? '',
    });
    revalidatePath('/album');
    return { success: 'アルバムを更新しました。' };
  } catch (error) {
    return toFormState(error, { action: 'album.update' });
  }
}

export async function deleteAlbumAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const parsed = deleteAlbumSchema.safeParse({
      familyId: field(formData, 'familyId'),
      albumId: field(formData, 'albumId'),
    });
    if (!parsed.success) return { error: '入力内容を確認してください。' };

    const session = await requireFamilyAccess(parsed.data.familyId);
    const album = await getAlbum({ familyId: session.familyId, albumId: parsed.data.albumId });
    if (!album) throw notFound('アルバムが見つかりません。');
    if (!canDeleteAlbum({ role: session.role, userId: session.userId, album })) {
      throw forbidden('このアルバムは作成者または管理者のみ削除できます。');
    }

    await deleteAlbum({ familyId: session.familyId, albumId: parsed.data.albumId });
  } catch (error) {
    return toFormState(error, { action: 'album.delete' });
  }

  revalidatePath('/album');
  redirect('/album');
}

export async function updatePhotoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const rawAlbumId = field(formData, 'albumId');
    const parsed = updatePhotoSchema.safeParse({
      familyId: field(formData, 'familyId'),
      photoId: field(formData, 'photoId'),
      caption: field(formData, 'caption'),
      albumId: rawAlbumId === '' ? null : rawAlbumId,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    const photo = await getPhoto({ familyId: session.familyId, photoId: parsed.data.photoId });
    if (!photo) throw notFound('写真が見つかりません。');
    if (!canEditPhoto({ role: session.role, userId: session.userId, photo })) {
      throw forbidden('この写真は投稿者または管理者のみ編集できます。');
    }

    if (parsed.data.albumId) {
      const album = await getAlbum({ familyId: session.familyId, albumId: parsed.data.albumId });
      if (!album) throw notFound('アルバムが見つかりません。');
    }

    await updatePhoto({
      familyId: session.familyId,
      photoId: parsed.data.photoId,
      caption: parsed.data.caption ?? '',
      albumId: parsed.data.albumId ?? null,
    });

    revalidatePath('/album');
    return { success: '写真を更新しました。' };
  } catch (error) {
    return toFormState(error, { action: 'photo.update' });
  }
}

export async function deletePhotoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let backTo = '/album';
  try {
    const parsed = deletePhotoSchema.safeParse({
      familyId: field(formData, 'familyId'),
      photoId: field(formData, 'photoId'),
    });
    if (!parsed.success) return { error: '入力内容を確認してください。' };

    const session = await requireFamilyAccess(parsed.data.familyId);
    const photo = await getPhoto({ familyId: session.familyId, photoId: parsed.data.photoId });
    if (!photo) throw notFound('写真が見つかりません。');
    if (!canDeletePhoto({ role: session.role, userId: session.userId, photo })) {
      throw forbidden('この写真は投稿者または管理者のみ削除できます。');
    }

    backTo = photo.albumId ? `/album/${photo.albumId}` : '/album';
    await deletePhoto({ familyId: session.familyId, photoId: parsed.data.photoId });

    logger.info('写真を削除しました', {
      userId: session.userId,
      familyId: session.familyId,
      action: 'photo.delete',
    });
  } catch (error) {
    return toFormState(error, { action: 'photo.delete' });
  }

  revalidatePath('/album');
  revalidatePath('/home');
  redirect(backTo);
}
