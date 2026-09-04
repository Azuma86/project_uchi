import { describe, expect, it } from 'vitest';
import {
  buildStoragePath,
  extensionForMime,
  isPathOwnedByFamily,
  pathKind,
} from '@/lib/storage/paths';

/**
 * 保存先パスのテスト。
 * 「クライアントが任意のパスを指定できない」ことがこのアプリの
 * ファイル分離の前提になっている。
 */

const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('パスの生成', () => {
  it('家族 ID と種別からパスを組み立てる', () => {
    expect(
      buildStoragePath({
        familyId: 'fam1',
        kind: 'photo',
        contentType: 'image/webp',
        objectId: uuid,
      }),
    ).toBe(`families/fam1/photos/${uuid}.webp`);
  });

  it('種別ごとにフォルダが分かれる', () => {
    expect(
      buildStoragePath({ familyId: 'f', kind: 'receipt', contentType: 'image/webp', objectId: uuid }),
    ).toContain('/receipts/');
    expect(
      buildStoragePath({
        familyId: 'f',
        kind: 'thumbnail',
        contentType: 'image/webp',
        objectId: uuid,
      }),
    ).toContain('/thumbnails/');
  });

  it('MIME から拡張子を決める', () => {
    expect(extensionForMime('image/webp')).toBe('webp');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    // 未知の形式は webp 扱い (呼び出し前に MIME を検証済みのため)
    expect(extensionForMime('image/gif')).toBe('webp');
  });
});

describe('家族スコープの検証', () => {
  it('自分の家族のパスだけ true になる', () => {
    expect(isPathOwnedByFamily('families/fam1/photos/a.webp', 'fam1')).toBe(true);
    expect(isPathOwnedByFamily('families/fam2/photos/a.webp', 'fam1')).toBe(false);
  });

  it('前方一致の悪用を防ぐ', () => {
    // "fam1" で始まる別の家族 ID を指定しても通らないこと
    expect(isPathOwnedByFamily('families/fam12/photos/a.webp', 'fam1')).toBe(false);
  });

  it('パス・トラバーサルを拒否する', () => {
    expect(isPathOwnedByFamily('families/fam1/../fam2/photos/a.webp', 'fam1')).toBe(false);
    expect(isPathOwnedByFamily('families/fam1//photos/a.webp', 'fam1')).toBe(false);
  });

  it('空文字を拒否する', () => {
    expect(isPathOwnedByFamily('', 'fam1')).toBe(false);
    expect(isPathOwnedByFamily('families/fam1/photos/a.webp', '')).toBe(false);
  });
});

describe('パスの種別判定', () => {
  it('フォルダから種別を判定する', () => {
    expect(pathKind('families/f/photos/a.webp')).toBe('photo');
    expect(pathKind('families/f/thumbnails/a.webp')).toBe('thumbnail');
    expect(pathKind('families/f/receipts/a.webp')).toBe('receipt');
  });

  it('未知のフォルダは null', () => {
    expect(pathKind('families/f/secrets/a.webp')).toBeNull();
    expect(pathKind('other/f/photos/a.webp')).toBeNull();
  });
});
