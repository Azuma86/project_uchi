import { describe, expect, it } from 'vitest';
import {
  eventFormSchema,
  expenseFormSchema,
  finalizePhotoSchema,
  idSchema,
  inviteCodeSchema,
  reviewExpenseSchema,
  storagePathSchema,
  uploadTargetSchema,
} from '@/lib/validation/schemas';

/**
 * 入力バリデーションのテスト。
 * クライアントを信用せず、サーバー側でも同じスキーマで検証するため、
 * ここが「不正な入力の最後の砦」になる。
 */

describe('ID の検証', () => {
  it('英数字とハイフン・アンダースコアのみ許可する', () => {
    expect(idSchema.safeParse('abc123_-XYZ').success).toBe(true);
  });

  it('パス・トラバーサルになりうる文字を拒否する', () => {
    expect(idSchema.safeParse('../other-family').success).toBe(false);
    expect(idSchema.safeParse('family/child').success).toBe(false);
    expect(idSchema.safeParse('').success).toBe(false);
  });
});

describe('招待コード', () => {
  it('10桁の英数字を受け付ける (紛らわしい文字は含まない)', () => {
    expect(inviteCodeSchema.safeParse('ABCD234XYZ').success).toBe(true);
  });

  it('小文字は大文字に正規化される', () => {
    const result = inviteCodeSchema.safeParse('abcd234xyz');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('ABCD234XYZ');
  });

  it('紛らわしい文字 (O, I, 0, 1) は使えない', () => {
    expect(inviteCodeSchema.safeParse('ABCD0O1IXY').success).toBe(false);
  });

  it('桁数が違うと拒否する', () => {
    expect(inviteCodeSchema.safeParse('ABC').success).toBe(false);
  });
});

describe('予定のフォーム', () => {
  const base = { title: '運動会', description: '', location: '', assignedUserId: '' };

  it('通常の予定は開始 <= 終了である必要がある', () => {
    expect(
      eventFormSchema.safeParse({
        ...base,
        allDay: false,
        startAt: '2026-09-04T09:00',
        endAt: '2026-09-04T12:00',
      }).success,
    ).toBe(true);

    expect(
      eventFormSchema.safeParse({
        ...base,
        allDay: false,
        startAt: '2026-09-04T13:00',
        endAt: '2026-09-04T12:00',
      }).success,
    ).toBe(false);
  });

  it('終日予定は日付だけで成立する', () => {
    expect(
      eventFormSchema.safeParse({ ...base, allDay: true, startDate: '2026-09-04' }).success,
    ).toBe(true);
  });

  it('終日予定で終了日が開始日より前だと拒否する', () => {
    expect(
      eventFormSchema.safeParse({
        ...base,
        allDay: true,
        startDate: '2026-09-04',
        endDate: '2026-09-01',
      }).success,
    ).toBe(false);
  });

  it('タイトルが無いと拒否する', () => {
    expect(
      eventFormSchema.safeParse({
        ...base,
        title: '',
        allDay: true,
        startDate: '2026-09-04',
      }).success,
    ).toBe(false);
  });
});

describe('経費のフォーム', () => {
  const base = {
    purchaseDate: '2026-09-04',
    merchant: 'スーパーやまだ',
    amount: 4580,
    category: 'food',
    description: '',
  };

  it('正しい入力を受け付ける', () => {
    expect(expenseFormSchema.safeParse(base).success).toBe(true);
  });

  it('0 円以下は拒否する', () => {
    expect(expenseFormSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, amount: -100 }).success).toBe(false);
  });

  it('小数の金額は拒否する (円は整数)', () => {
    expect(expenseFormSchema.safeParse({ ...base, amount: 100.5 }).success).toBe(false);
  });

  it('存在しないカテゴリは拒否する', () => {
    expect(expenseFormSchema.safeParse({ ...base, category: 'gambling' }).success).toBe(false);
  });

  it('店舗名が空だと拒否する', () => {
    expect(expenseFormSchema.safeParse({ ...base, merchant: '' }).success).toBe(false);
  });

  it('極端に大きい金額は拒否する (入力ミス対策)', () => {
    expect(expenseFormSchema.safeParse({ ...base, amount: 99_999_999 }).success).toBe(false);
  });
});

describe('審査の入力', () => {
  it('approved / rejected 以外の判定は拒否する', () => {
    expect(
      reviewExpenseSchema.safeParse({
        familyId: 'fam1',
        expenseId: 'exp1',
        decision: 'approved',
        adminComment: '',
      }).success,
    ).toBe(true);

    expect(
      reviewExpenseSchema.safeParse({
        familyId: 'fam1',
        expenseId: 'exp1',
        decision: 'draft',
        adminComment: '',
      }).success,
    ).toBe(false);
  });
});

describe('Cloud Storage のパス', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('正規のパスを受け付ける', () => {
    expect(storagePathSchema.safeParse(`families/fam1/photos/${uuid}.webp`).success).toBe(true);
    expect(storagePathSchema.safeParse(`families/fam1/receipts/${uuid}.jpg`).success).toBe(true);
  });

  it('families 以外のパスを拒否する', () => {
    expect(storagePathSchema.safeParse(`secret/${uuid}.webp`).success).toBe(false);
  });

  it('パス・トラバーサルを拒否する', () => {
    expect(storagePathSchema.safeParse(`families/../../etc/passwd`).success).toBe(false);
    expect(storagePathSchema.safeParse(`families/fam1/photos/../../../x.webp`).success).toBe(false);
  });

  it('許可されていない拡張子を拒否する', () => {
    expect(storagePathSchema.safeParse(`families/fam1/photos/${uuid}.svg`).success).toBe(false);
    expect(storagePathSchema.safeParse(`families/fam1/photos/${uuid}.html`).success).toBe(false);
  });

  it('写真の登録は正規のパスのみ受け付ける', () => {
    expect(
      finalizePhotoSchema.safeParse({
        familyId: 'fam1',
        storagePath: `families/fam1/photos/${uuid}.webp`,
        caption: '',
      }).success,
    ).toBe(true);

    expect(
      finalizePhotoSchema.safeParse({
        familyId: 'fam1',
        storagePath: 'https://evil.example.com/x.webp',
        caption: '',
      }).success,
    ).toBe(false);
  });
});

describe('アップロード要求', () => {
  it('許可された形式とサイズを受け付ける', () => {
    expect(
      uploadTargetSchema.safeParse({
        familyId: 'fam1',
        kind: 'photo',
        contentType: 'image/webp',
        byteSize: 300_000,
      }).success,
    ).toBe(true);
  });

  it('WebP / JPEG 以外の形式を拒否する', () => {
    expect(
      uploadTargetSchema.safeParse({
        familyId: 'fam1',
        kind: 'photo',
        contentType: 'image/svg+xml',
        byteSize: 1000,
      }).success,
    ).toBe(false);
  });

  it('上限を超えるサイズを拒否する', () => {
    expect(
      uploadTargetSchema.safeParse({
        familyId: 'fam1',
        kind: 'photo',
        contentType: 'image/webp',
        byteSize: 50 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });

  it('サムネイルの上限は写真より小さい', () => {
    expect(
      uploadTargetSchema.safeParse({
        familyId: 'fam1',
        kind: 'thumbnail',
        contentType: 'image/webp',
        byteSize: 2 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });
});
