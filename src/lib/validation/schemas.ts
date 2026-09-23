import { z } from 'zod';
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, ROLES } from '@/lib/types';
import { ALLOWED_STORED_MIME, MAX_BYTES_BY_KIND } from '@/lib/validation/upload';
import { isValidDayKey, isValidMonthKey } from '@/lib/datetime';

/**
 * 入力バリデーション (Zod)。
 *
 * 同じスキーマをクライアントのフォームと Server Action の両方で使う。
 * クライアント側の検証は「体験のため」、サーバー側の検証は「防御のため」。
 * サーバー側を省略すると、fetch や curl で Server Action を直接叩かれた時に
 * 不正なデータが Firestore に入る。
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  // Firestore のドキュメント ID として安全な文字だけ許可 (パス・トラバーサル対策)
  .regex(/^[A-Za-z0-9_-]+$/, 'IDの形式が正しくありません。');

export const roleSchema = z.enum(ROLES as [string, ...string[]]);

// ---------------------------------------------------------------------------
// グループ (招待・メンバー)
//
// グループ名はユーザーが入力しないので、対応するスキーマも持たない。
// ---------------------------------------------------------------------------

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/, '招待コードは10桁の英数字です。');

export const joinFamilySchema = z.object({
  inviteCode: inviteCodeSchema,
});
export type JoinFamilyInput = z.infer<typeof joinFamilySchema>;

export const memberActionSchema = z.object({
  familyId: idSchema,
  targetUserId: idSchema,
});

export const changeRoleSchema = memberActionSchema.extend({
  role: z.enum(['admin', 'member']),
});

export const updateProfileSchema = z.object({
  displayName: trimmed(30).min(1, '表示名を入力してください。'),
});

// ---------------------------------------------------------------------------
// カレンダー
// ---------------------------------------------------------------------------

const dateTimeLocal = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, '日時の形式が正しくありません。');

const dateOnly = z
  .string()
  .trim()
  .refine(isValidDayKey, '日付の形式が正しくありません。');

export const eventFormSchema = z
  .object({
    title: trimmed(100).min(1, '予定のタイトルを入力してください。'),
    description: trimmed(2000).optional().default(''),
    allDay: z.boolean().default(false),
    /** allDay=false のとき使う (JST の壁掛け時刻) */
    startAt: dateTimeLocal.optional(),
    endAt: dateTimeLocal.optional(),
    /** allDay=true のとき使う */
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
    location: trimmed(200).optional().default(''),
    assignedUserId: z.string().trim().max(128).optional().default(''),
  })
  .superRefine((value, ctx) => {
    if (value.allDay) {
      if (!value.startDate) {
        ctx.addIssue({ code: 'custom', path: ['startDate'], message: '開始日を入力してください。' });
        return;
      }
      const end = value.endDate ?? value.startDate;
      if (end < value.startDate) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: '終了日は開始日以降にしてください。' });
      }
    } else {
      if (!value.startAt) {
        ctx.addIssue({ code: 'custom', path: ['startAt'], message: '開始日時を入力してください。' });
        return;
      }
      if (!value.endAt) {
        ctx.addIssue({ code: 'custom', path: ['endAt'], message: '終了日時を入力してください。' });
        return;
      }
      if (value.endAt < value.startAt) {
        ctx.addIssue({ code: 'custom', path: ['endAt'], message: '終了日時は開始日時以降にしてください。' });
      }
    }
  });
export type EventFormInput = z.input<typeof eventFormSchema>;

export const createEventSchema = z.object({
  familyId: idSchema,
  event: eventFormSchema,
});

export const updateEventSchema = z.object({
  familyId: idSchema,
  eventId: idSchema,
  event: eventFormSchema,
});

export const deleteEventSchema = z.object({
  familyId: idSchema,
  eventId: idSchema,
});

export const monthKeySchema = z.string().refine(isValidMonthKey, '年月の形式が正しくありません。');

// ---------------------------------------------------------------------------
// アルバム / 写真
// ---------------------------------------------------------------------------

export const createAlbumSchema = z.object({
  familyId: idSchema,
  name: trimmed(50).min(1, 'アルバム名を入力してください。'),
  description: trimmed(500).optional().default(''),
});

export const updateAlbumSchema = z.object({
  familyId: idSchema,
  albumId: idSchema,
  name: trimmed(50).min(1, 'アルバム名を入力してください。'),
  description: trimmed(500).optional().default(''),
});

export const deleteAlbumSchema = z.object({
  familyId: idSchema,
  albumId: idSchema,
});

/** 署名付きアップロード URL の発行リクエスト */
export const uploadTargetSchema = z.object({
  familyId: idSchema,
  kind: z.enum(['photo', 'thumbnail', 'receipt']),
  contentType: z.enum(ALLOWED_STORED_MIME as unknown as [string, ...string[]]),
  byteSize: z.number().int().positive(),
}).superRefine((value, ctx) => {
  const max = MAX_BYTES_BY_KIND[value.kind];
  if (value.byteSize > max) {
    ctx.addIssue({
      code: 'custom',
      path: ['byteSize'],
      message: `ファイルサイズが大きすぎます (上限 ${Math.round(max / 1024 / 1024)}MB)。`,
    });
  }
});
export type UploadTargetInput = z.infer<typeof uploadTargetSchema>;

/**
 * アップロード完了後に写真を登録する。
 * storagePath はサーバーが発行したものだけを受け付けたいので、
 * 形式を厳密に検証したうえでサーバー側で家族 ID の一致も確認する。
 */
export const storagePathSchema = z
  .string()
  .regex(
    /^families\/[A-Za-z0-9_-]{1,128}\/(photos|thumbnails|receipts)\/[0-9a-f-]{36}\.(webp|jpg)$/,
    '保存先の形式が正しくありません。',
  );

export const finalizePhotoSchema = z.object({
  familyId: idSchema,
  albumId: idSchema.nullable().optional(),
  storagePath: storagePathSchema,
  thumbnailStoragePath: storagePathSchema.nullable().optional(),
  caption: trimmed(300).optional().default(''),
  takenAt: z.string().datetime({ offset: true }).optional(),
  width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(),
});
export type FinalizePhotoInput = z.infer<typeof finalizePhotoSchema>;

export const updatePhotoSchema = z.object({
  familyId: idSchema,
  photoId: idSchema,
  caption: trimmed(300).optional().default(''),
  albumId: idSchema.nullable().optional(),
});

export const deletePhotoSchema = z.object({
  familyId: idSchema,
  photoId: idSchema,
});

// ---------------------------------------------------------------------------
// 経費
// ---------------------------------------------------------------------------

export const expenseFormSchema = z.object({
  purchaseDate: dateOnly,
  merchant: trimmed(100).min(1, '店舗名を入力してください。'),
  amount: z
    .number({ error: '金額を入力してください。' })
    .int('金額は1円単位で入力してください。')
    .min(1, '金額は1円以上で入力してください。')
    .max(10_000_000, '金額が大きすぎます。'),
  category: z.enum(EXPENSE_CATEGORIES as unknown as [string, ...string[]]),
  description: trimmed(1000).optional().default(''),
  receiptStoragePath: storagePathSchema.nullable().optional(),
});
export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

export const createExpenseSchema = z.object({
  familyId: idSchema,
  expense: expenseFormSchema,
  /** true なら作成と同時に申請 (pending) にする */
  submit: z.boolean().default(false),
});

export const updateExpenseSchema = z.object({
  familyId: idSchema,
  expenseId: idSchema,
  expense: expenseFormSchema,
  submit: z.boolean().default(false),
});

export const expenseIdSchema = z.object({
  familyId: idSchema,
  expenseId: idSchema,
});

export const reviewExpenseSchema = z.object({
  familyId: idSchema,
  expenseId: idSchema,
  decision: z.enum(['approved', 'rejected']),
  adminComment: trimmed(500).optional().default(''),
});
export type ReviewExpenseInput = z.infer<typeof reviewExpenseSchema>;

export const expenseStatusSchema = z.enum(EXPENSE_STATUSES as unknown as [string, ...string[]]);

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------

export const sessionLoginSchema = z.object({
  idToken: z.string().min(20).max(4096),
});

export const emailSchema = z.email('メールアドレスの形式が正しくありません。');

export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上にしてください。')
  .max(128);

export const signUpSchema = z.object({
  displayName: trimmed(30).min(1, '表示名を入力してください。'),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
