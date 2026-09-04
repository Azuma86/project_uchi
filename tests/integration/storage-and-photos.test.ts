import { beforeEach, describe, expect, it } from 'vitest';
import {
  createUploadTarget,
  deleteObject,
  downloadObject,
  saveObjectFromBuffer,
  verifyUploadedObject,
} from '@/lib/storage/gcs';
import { createPhoto, countPhotos, deletePhoto, getPhoto, listPhotos, updatePhoto } from '@/lib/data/photos';
import { createAlbum, getAlbum } from '@/lib/data/albums';
import { getBucket } from '@/lib/firebase/admin';
import { isPathOwnedByFamily } from '@/lib/storage/paths';
import { AppError } from '@/lib/errors';

/**
 * Cloud Storage と写真メタデータの統合テスト。
 *
 * 検証したいこと:
 *   - 保存先パスをサーバーが生成し、クライアントが指定できないこと
 *   - アップロード後に「実物」を検証していること (申告値を信用しない)
 *   - 別家族のパスを渡しても拒否されること
 *   - 写真の削除で Firestore と Cloud Storage の両方が消えること
 */

const FAMILY_A = 'itest-family-a';
const FAMILY_B = 'itest-family-b';
const USER = 'itest-uploader';

/** 検証用の小さなダミー画像 (中身は問わない。サイズと Content-Type だけを見る) */
const smallImage = Buffer.alloc(2048, 0x42);

async function clearFirestore(): Promise<void> {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}

beforeEach(async () => {
  await clearFirestore();
});

describe('アップロード先の払い出し', () => {
  it('保存先パスはサーバーが生成する (家族 ID + UUID)', async () => {
    const target = await createUploadTarget({
      familyId: FAMILY_A,
      kind: 'photo',
      contentType: 'image/webp',
      byteSize: 300_000,
    });

    expect(target.storagePath).toMatch(
      new RegExp(`^families/${FAMILY_A}/photos/[0-9a-f-]{36}\\.webp$`),
    );
    expect(target.headers['Content-Type']).toBe('image/webp');
    expect(new Date(target.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('呼び出すたびに異なるファイル名になる (上書きの防止)', async () => {
    const a = await createUploadTarget({ familyId: FAMILY_A, kind: 'photo', contentType: 'image/webp', byteSize: 1000 });
    const b = await createUploadTarget({ familyId: FAMILY_A, kind: 'photo', contentType: 'image/webp', byteSize: 1000 });
    expect(a.storagePath).not.toBe(b.storagePath);
  });

  it('種別ごとにフォルダが分かれる', async () => {
    const receipt = await createUploadTarget({ familyId: FAMILY_A, kind: 'receipt', contentType: 'image/jpeg', byteSize: 1000 });
    expect(receipt.storagePath).toContain(`families/${FAMILY_A}/receipts/`);
    expect(receipt.storagePath).toMatch(/\.jpg$/);
  });

  it('許可されていない形式は拒否する', async () => {
    await expect(
      createUploadTarget({ familyId: FAMILY_A, kind: 'photo', contentType: 'image/svg+xml', byteSize: 1000 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('上限を超えるサイズは拒否する', async () => {
    await expect(
      createUploadTarget({ familyId: FAMILY_A, kind: 'photo', contentType: 'image/webp', byteSize: 50 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('サムネイルの上限は写真より小さい', async () => {
    await expect(
      createUploadTarget({ familyId: FAMILY_A, kind: 'thumbnail', contentType: 'image/webp', byteSize: 2 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('アップロード後の検証', () => {
  it('実際に保存されたオブジェクトのサイズと形式を返す', async () => {
    const target = await createUploadTarget({ familyId: FAMILY_A, kind: 'photo', contentType: 'image/webp', byteSize: smallImage.byteLength });
    await saveObjectFromBuffer({
      storagePath: target.storagePath,
      familyId: FAMILY_A,
      contentType: 'image/webp',
      buffer: smallImage,
    });

    const meta = await verifyUploadedObject({ storagePath: target.storagePath, familyId: FAMILY_A, kind: 'photo' });
    expect(meta.byteSize).toBe(smallImage.byteLength);
    expect(meta.contentType).toBe('image/webp');
  });

  it('存在しないオブジェクトは not_found になる', async () => {
    await expect(
      verifyUploadedObject({
        storagePath: `families/${FAMILY_A}/photos/00000000-0000-0000-0000-000000000000.webp`,
        familyId: FAMILY_A,
        kind: 'photo',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('別家族のパスは拒否される (IDOR 対策)', async () => {
    const target = await createUploadTarget({ familyId: FAMILY_B, kind: 'photo', contentType: 'image/webp', byteSize: 1000 });
    await saveObjectFromBuffer({ storagePath: target.storagePath, familyId: FAMILY_B, contentType: 'image/webp', buffer: smallImage });

    // FAMILY_A のユーザーとして FAMILY_B のパスを検証しようとする
    await expect(
      verifyUploadedObject({ storagePath: target.storagePath, familyId: FAMILY_A, kind: 'photo' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('申告と違う巨大なファイルは削除して拒否する', async () => {
    // 「小さい」と申告して払い出しを受け、実際には上限超えを置く
    const target = await createUploadTarget({ familyId: FAMILY_A, kind: 'thumbnail', contentType: 'image/webp', byteSize: 1000 });
    const oversized = Buffer.alloc(600 * 1024, 0x41); // サムネイル上限 512KB を超える
    await saveObjectFromBuffer({ storagePath: target.storagePath, familyId: FAMILY_A, contentType: 'image/webp', buffer: oversized });

    await expect(
      verifyUploadedObject({ storagePath: target.storagePath, familyId: FAMILY_A, kind: 'thumbnail' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });

    // 拒否したオブジェクトは残さない (課金され続けるため)
    const [exists] = await getBucket().file(target.storagePath).exists();
    expect(exists).toBe(false);
  });

  it('許可されていない Content-Type で保存されたものは削除して拒否する', async () => {
    const path = `families/${FAMILY_A}/photos/11111111-1111-1111-1111-111111111111.webp`;
    await saveObjectFromBuffer({ storagePath: path, familyId: FAMILY_A, contentType: 'image/svg+xml', buffer: smallImage });

    await expect(
      verifyUploadedObject({ storagePath: path, familyId: FAMILY_A, kind: 'photo' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });

    const [exists] = await getBucket().file(path).exists();
    expect(exists).toBe(false);
  });
});

describe('オブジェクトの読み取りと削除', () => {
  it('保存したバイト列を取得できる', async () => {
    const path = `families/${FAMILY_A}/photos/22222222-2222-2222-2222-222222222222.webp`;
    await saveObjectFromBuffer({ storagePath: path, familyId: FAMILY_A, contentType: 'image/webp', buffer: smallImage });

    const result = await downloadObject({ storagePath: path, familyId: FAMILY_A });
    expect(result.buffer.byteLength).toBe(smallImage.byteLength);
    expect(result.contentType).toBe('image/webp');
  });

  it('別家族のオブジェクトは読み取れない', async () => {
    const path = `families/${FAMILY_B}/photos/33333333-3333-3333-3333-333333333333.webp`;
    await saveObjectFromBuffer({ storagePath: path, familyId: FAMILY_B, contentType: 'image/webp', buffer: smallImage });

    await expect(downloadObject({ storagePath: path, familyId: FAMILY_A })).rejects.toThrowError(AppError);
  });

  it('別家族のオブジェクトは削除できない', async () => {
    const path = `families/${FAMILY_B}/photos/44444444-4444-4444-4444-444444444444.webp`;
    await saveObjectFromBuffer({ storagePath: path, familyId: FAMILY_B, contentType: 'image/webp', buffer: smallImage });

    await expect(deleteObject({ storagePath: path, familyId: FAMILY_A })).rejects.toMatchObject({
      code: 'forbidden',
    });

    // 消えていないこと
    const [exists] = await getBucket().file(path).exists();
    expect(exists).toBe(true);
    await deleteObject({ storagePath: path, familyId: FAMILY_B });
  });

  it('パスの前方一致では他家族に届かない', () => {
    expect(isPathOwnedByFamily(`families/${FAMILY_A}extra/photos/x.webp`, FAMILY_A)).toBe(false);
  });
});

describe('写真のライフサイクル', () => {
  async function uploadPhoto(familyId: string, albumId: string | null) {
    const main = await createUploadTarget({ familyId, kind: 'photo', contentType: 'image/webp', byteSize: smallImage.byteLength });
    const thumb = await createUploadTarget({ familyId, kind: 'thumbnail', contentType: 'image/webp', byteSize: smallImage.byteLength });

    for (const path of [main.storagePath, thumb.storagePath]) {
      await saveObjectFromBuffer({ storagePath: path, familyId, contentType: 'image/webp', buffer: smallImage });
    }

    const meta = await verifyUploadedObject({ storagePath: main.storagePath, familyId, kind: 'photo' });

    const photoId = await createPhoto({
      familyId,
      userId: USER,
      albumId,
      storagePath: main.storagePath,
      thumbnailStoragePath: thumb.storagePath,
      caption: 'テスト写真',
      takenAt: new Date('2026-09-04T03:00:00.000Z'),
      width: 1600,
      height: 1200,
      byteSize: meta.byteSize,
      contentType: meta.contentType,
    });

    return { photoId, main: main.storagePath, thumb: thumb.storagePath };
  }

  it('アップロードから登録・取得までが通る', async () => {
    const { photoId, main } = await uploadPhoto(FAMILY_A, null);
    const photo = await getPhoto({ familyId: FAMILY_A, photoId });

    expect(photo).not.toBeNull();
    expect(photo!.storagePath).toBe(main);
    expect(photo!.caption).toBe('テスト写真');
    expect(photo!.byteSize).toBe(smallImage.byteLength);
    expect(photo!.uploadedBy).toBe(USER);
    expect(await countPhotos(FAMILY_A)).toBe(1);
  });

  it('アルバムに入れると枚数とカバーが更新される', async () => {
    const albumId = await createAlbum({ familyId: FAMILY_A, userId: USER, name: '夏', description: '' });
    const { photoId } = await uploadPhoto(FAMILY_A, albumId);

    const album = await getAlbum({ familyId: FAMILY_A, albumId });
    expect(album!.photoCount).toBe(1);
    expect(album!.coverPhotoId).toBe(photoId);

    const inAlbum = await listPhotos({ familyId: FAMILY_A, albumId });
    expect(inAlbum).toHaveLength(1);
  });

  it('アルバムを移動すると両方の枚数が調整される', async () => {
    const albumA = await createAlbum({ familyId: FAMILY_A, userId: USER, name: 'A', description: '' });
    const albumB = await createAlbum({ familyId: FAMILY_A, userId: USER, name: 'B', description: '' });
    const { photoId } = await uploadPhoto(FAMILY_A, albumA);

    await updatePhoto({ familyId: FAMILY_A, photoId, caption: '移動後', albumId: albumB });

    expect((await getAlbum({ familyId: FAMILY_A, albumId: albumA }))!.photoCount).toBe(0);
    expect((await getAlbum({ familyId: FAMILY_A, albumId: albumB }))!.photoCount).toBe(1);
  });

  it('削除すると Firestore と Cloud Storage の両方から消える', async () => {
    const albumId = await createAlbum({ familyId: FAMILY_A, userId: USER, name: '夏', description: '' });
    const { photoId, main, thumb } = await uploadPhoto(FAMILY_A, albumId);

    await deletePhoto({ familyId: FAMILY_A, photoId });

    expect(await getPhoto({ familyId: FAMILY_A, photoId })).toBeNull();
    expect((await getAlbum({ familyId: FAMILY_A, albumId }))!.photoCount).toBe(0);

    for (const path of [main, thumb]) {
      const [exists] = await getBucket().file(path).exists();
      expect(exists).toBe(false);
    }
  });

  it('別家族の写真は取得できない', async () => {
    const { photoId } = await uploadPhoto(FAMILY_A, null);
    expect(await getPhoto({ familyId: FAMILY_B, photoId })).toBeNull();
  });

  it('撮影日の新しい順に並ぶ', async () => {
    const first = await uploadPhoto(FAMILY_A, null);
    await createPhoto({
      familyId: FAMILY_A,
      userId: USER,
      albumId: null,
      storagePath: `families/${FAMILY_A}/photos/55555555-5555-5555-5555-555555555555.webp`,
      thumbnailStoragePath: null,
      caption: '新しい写真',
      takenAt: new Date('2026-09-10T03:00:00.000Z'),
      width: null,
      height: null,
      byteSize: 1000,
      contentType: 'image/webp',
    });

    const photos = await listPhotos({ familyId: FAMILY_A });
    expect(photos[0]!.caption).toBe('新しい写真');
    expect(photos[1]!.id).toBe(first.photoId);
  });
});
