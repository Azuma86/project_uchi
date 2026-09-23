import type { Expense, Photo, Role } from '@/lib/types';
import { conflict, forbidden } from '@/lib/errors';

/**
 * 権限判定ロジック (純粋関数)。
 *
 * ここに集約する理由:
 *   1. UI (ボタンを出すか) とサーバー (実際に許可するか) で同じ判定を使うため。
 *      UI だけで隠しても Server Action を直接叩かれれば意味がないので、
 *      サーバー側でも必ずこの関数を通す。
 *   2. Firestore Security Rules と 1:1 で対応させ、テストしやすくするため。
 *      firebase/firestore.rules のコメントに対応関係を書いてある。
 *
 * 3 層で守る:
 *   - Security Rules  : クライアント SDK からの直接アクセスを DB 側で遮断
 *   - この permissions: Server Action / Route Handler での判定
 *   - UI              : そもそもボタンを出さない (利便性のため。防御ではない)
 */

/**
 * 家族アプリの割り切り: admin は自分が申請した経費も承認できる。
 * 企業の稟議なら自己承認は禁止すべきだが、家族 2〜3 人で admin が
 * 1 人しかいない状況では運用が回らなくなるため許可している。
 * 監査したい場合は reviewedBy と applicantUserId を比較すれば検出できる。
 */
export const ALLOW_SELF_APPROVAL = true;

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function isMember(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'member';
}

/** 家族メンバーの招待・削除・role 変更・家族設定の変更 */
export function canManageFamily(role: Role): boolean {
  return isAdmin(role);
}

/** 招待コードの生成・無効化 */
export function canManageInvites(role: Role): boolean {
  return isAdmin(role);
}

/** 経費の承認 / 却下 */
export function canReviewExpense(params: {
  role: Role;
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): boolean {
  if (!isAdmin(params.role)) return false;
  if (params.expense.status !== 'pending') return false;
  if (!ALLOW_SELF_APPROVAL && params.expense.applicantUserId === params.userId) return false;
  return true;
}

/**
 * 経費の編集可否。
 * pending (申請済み) になったら申請者は変更できない — 承認者が見た内容と
 * 実際の内容がずれるのを防ぐため。却下されたら下書きに戻して修正できる。
 */
export function canEditExpense(params: {
  role: Role;
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): boolean {
  const isApplicant = params.expense.applicantUserId === params.userId;
  if (!isApplicant) return false;
  return params.expense.status === 'draft' || params.expense.status === 'rejected';
}

/** 申請 (draft/rejected -> pending) */
export function canSubmitExpense(params: {
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): boolean {
  if (params.expense.applicantUserId !== params.userId) return false;
  return params.expense.status === 'draft' || params.expense.status === 'rejected';
}

/** 申請の取り下げ (pending -> draft) */
export function canWithdrawExpense(params: {
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): boolean {
  return params.expense.applicantUserId === params.userId && params.expense.status === 'pending';
}

/**
 * 経費の削除。
 *
 * 承認済みも削除できる (入力ミスや重複申請を後から片付けられるようにするため)。
 * ただし「審査中に申請者が消してしまう」事故は防ぎたいので、pending だけは
 * 申請者が直接削除できない — 先に取り下げる必要がある。admin は例外なく削除できる。
 */
export function canDeleteExpense(params: {
  role: Role;
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): boolean {
  if (isAdmin(params.role)) return true;
  return params.expense.applicantUserId === params.userId && params.expense.status !== 'pending';
}

/** 領収書の閲覧。申請者本人と admin のみ。 */
export function canViewReceipt(params: {
  role: Role;
  userId: string;
  expense: Pick<Expense, 'applicantUserId'>;
}): boolean {
  return isAdmin(params.role) || params.expense.applicantUserId === params.userId;
}

/** 予定の編集は家族全員 (共有カレンダーのため) */
export function canEditEvent(role: Role): boolean {
  return isMember(role);
}

/** 予定の削除は作成者か admin (誤削除を防ぐ) */
export function canDeleteEvent(params: {
  role: Role;
  userId: string;
  event: { createdBy: string };
}): boolean {
  return isAdmin(params.role) || params.event.createdBy === params.userId;
}

/** 写真の削除はアップロードした本人か admin */
export function canDeletePhoto(params: {
  role: Role;
  userId: string;
  photo: Pick<Photo, 'uploadedBy'>;
}): boolean {
  return isAdmin(params.role) || params.photo.uploadedBy === params.userId;
}

/** キャプション編集はアップロードした本人か admin */
export function canEditPhoto(params: {
  role: Role;
  userId: string;
  photo: Pick<Photo, 'uploadedBy'>;
}): boolean {
  return isAdmin(params.role) || params.photo.uploadedBy === params.userId;
}

/** アルバムの削除は作成者か admin */
export function canDeleteAlbum(params: {
  role: Role;
  userId: string;
  album: { createdBy: string };
}): boolean {
  return isAdmin(params.role) || params.album.createdBy === params.userId;
}

/** 自分自身を家族から外す / 最後の admin を降格させることは禁止 */
export function canRemoveMember(params: {
  actorRole: Role;
  actorUserId: string;
  targetUserId: string;
  adminCount: number;
  targetRole: Role;
}): boolean {
  if (!isAdmin(params.actorRole)) return false;
  if (params.actorUserId === params.targetUserId) return false;
  if (params.targetRole === 'admin' && params.adminCount <= 1) return false;
  return true;
}

export function canChangeRole(params: {
  actorRole: Role;
  actorUserId: string;
  targetUserId: string;
  targetRole: Role;
  nextRole: Role;
  adminCount: number;
}): boolean {
  if (!isAdmin(params.actorRole)) return false;
  if (params.targetRole === params.nextRole) return false;
  // 家族から admin が 0 人になると誰も管理できなくなる
  if (params.targetRole === 'admin' && params.nextRole === 'member' && params.adminCount <= 1) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// アサーション版 (Server Action から呼び、失敗時は AppError を投げる)
// ---------------------------------------------------------------------------

export function assertAdmin(role: Role): void {
  if (!isAdmin(role)) {
    throw forbidden('この操作は管理者のみ実行できます。');
  }
}

export function assertCanReviewExpense(params: {
  role: Role;
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): void {
  if (!isAdmin(params.role)) {
    throw forbidden('経費の承認・却下は管理者のみ実行できます。');
  }
  if (params.expense.status !== 'pending') {
    throw conflict('この経費はすでに処理済みです。');
  }
  if (!canReviewExpense(params)) {
    throw forbidden('この経費を承認・却下することはできません。');
  }
}

export function assertCanEditExpense(params: {
  role: Role;
  userId: string;
  expense: Pick<Expense, 'status' | 'applicantUserId'>;
}): void {
  if (params.expense.applicantUserId !== params.userId) {
    throw forbidden('自分が作成した経費のみ編集できます。');
  }
  if (!canEditExpense(params)) {
    throw conflict('申請済みの経費は編集できません。取り下げてから編集してください。');
  }
}
