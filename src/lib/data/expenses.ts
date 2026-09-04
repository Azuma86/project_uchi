import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { expenseDoc, expensesCol } from '@/lib/data/paths';
import { num, str, strOrNull, tsToIso, tsToIsoOrNull } from '@/lib/firebase/converters';
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
  type Role,
} from '@/lib/types';
import { conflict, notFound } from '@/lib/errors';
import { getDb } from '@/lib/firebase/admin';
import { jstInputToUtc, jstMonthKey } from '@/lib/datetime';
import type { ExpenseFormInput } from '@/lib/validation/schemas';
import { assertCanReviewExpense, canDeleteExpense, canSubmitExpense, canWithdrawExpense } from '@/lib/permissions';
import { forbidden } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { deleteObject } from '@/lib/storage/gcs';

/**
 * 経費申請。
 *
 * 集計方針 (README「経費集計の設計判断」参照):
 *   家族数人・月に数十件という規模なので、「その月の経費を 1 クエリで取得して
 *   アプリ側で合計する」方式を採用した。集計用ドキュメント (カウンタ) を
 *   持つ方式は、書き込みのたびにトランザクションが増え、ズレたときの
 *   修復も面倒なので MVP では選ばない。
 *   件数だけが欲しい場所 (承認待ちバッジ) は aggregate query の count() を使い、
 *   ドキュメントを読まずに済ませている。
 */

function toExpense(id: string, familyId: string, data: FirebaseFirestore.DocumentData): Expense {
  const category = EXPENSE_CATEGORIES.includes(data.category as ExpenseCategory)
    ? (data.category as ExpenseCategory)
    : 'other';
  return {
    id,
    familyId,
    applicantUserId: str(data.applicantUserId),
    purchaseDate: tsToIso(data.purchaseDate),
    merchant: str(data.merchant),
    amount: num(data.amount, 0),
    category,
    description: strOrNull(data.description),
    receiptStoragePath: strOrNull(data.receiptStoragePath),
    status: (['draft', 'pending', 'approved', 'rejected'] as const).includes(data.status)
      ? (data.status as ExpenseStatus)
      : 'draft',
    adminComment: strOrNull(data.adminComment),
    reviewedBy: strOrNull(data.reviewedBy),
    reviewedAt: tsToIsoOrNull(data.reviewedAt),
    yearMonth: str(data.yearMonth),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

function expenseInputToDocument(input: ExpenseFormInput) {
  const purchaseDate = jstInputToUtc(input.purchaseDate);
  return {
    purchaseDate: Timestamp.fromDate(purchaseDate),
    // 月次集計を「単一フィールドの等価条件」で引けるように非正規化する。
    // 範囲クエリより安く、複合インデックスも小さくて済む。
    yearMonth: jstMonthKey(purchaseDate),
    merchant: input.merchant,
    amount: input.amount,
    category: input.category,
    description: input.description ? input.description : null,
    receiptStoragePath: input.receiptStoragePath ?? null,
  };
}

export async function getExpense(params: {
  familyId: string;
  expenseId: string;
}): Promise<Expense | null> {
  const snap = await expenseDoc(params.familyId, params.expenseId).get();
  if (!snap.exists) return null;
  return toExpense(snap.id, params.familyId, snap.data() ?? {});
}

export type ExpenseListFilter = {
  familyId: string;
  /** 指定するとその人の申請だけ */
  applicantUserId?: string | null;
  status?: ExpenseStatus | null;
  /** "2026-09" */
  yearMonth?: string | null;
  limit?: number;
};

export async function listExpenses(filter: ExpenseListFilter): Promise<Expense[]> {
  let query: FirebaseFirestore.Query = expensesCol(filter.familyId);

  if (filter.applicantUserId) query = query.where('applicantUserId', '==', filter.applicantUserId);
  if (filter.status) query = query.where('status', '==', filter.status);
  if (filter.yearMonth) query = query.where('yearMonth', '==', filter.yearMonth);

  const snap = await query.orderBy('createdAt', 'desc').limit(filter.limit ?? 100).get();
  return snap.docs.map((doc) => toExpense(doc.id, filter.familyId, doc.data()));
}

/**
 * 一覧で「下書きは本人にしか見せない」ためのフィルタ。
 * Firestore のクエリで OR 条件を書くより、取得後に絞る方が単純。
 * (件数が少ないので read の無駄は許容範囲)
 */
export function visibleExpenses(params: {
  expenses: Expense[];
  userId: string;
  role: Role;
}): Expense[] {
  return params.expenses.filter(
    (expense) => expense.status !== 'draft' || expense.applicantUserId === params.userId,
  );
}

/** 承認待ち件数。count() はドキュメントを読まないので安い。 */
export async function countPendingExpenses(familyId: string): Promise<number> {
  const snap = await expensesCol(familyId).where('status', '==', 'pending').count().get();
  return snap.data().count;
}

export type ExpenseSummary = {
  yearMonth: string;
  approvedTotal: number;
  pendingTotal: number;
  rejectedTotal: number;
  draftTotal: number;
  approvedCount: number;
  pendingCount: number;
  byCategory: { category: ExpenseCategory; total: number; count: number }[];
  byApplicant: { userId: string; total: number; count: number }[];
};

/**
 * 月次集計。その月の経費を 1 クエリで取り、メモリ上で合計する。
 * 読み取り件数 = その月の経費件数 (家族なら多くても数十)。
 */
export async function getMonthlySummary(params: {
  familyId: string;
  yearMonth: string;
  userId: string;
  role: Role;
}): Promise<{ summary: ExpenseSummary; expenses: Expense[] }> {
  const snap = await expensesCol(params.familyId)
    .where('yearMonth', '==', params.yearMonth)
    .orderBy('purchaseDate', 'desc')
    .get();

  const all = snap.docs.map((doc) => toExpense(doc.id, params.familyId, doc.data()));
  const expenses = visibleExpenses({ expenses: all, userId: params.userId, role: params.role });

  const summary: ExpenseSummary = {
    yearMonth: params.yearMonth,
    approvedTotal: 0,
    pendingTotal: 0,
    rejectedTotal: 0,
    draftTotal: 0,
    approvedCount: 0,
    pendingCount: 0,
    byCategory: [],
    byApplicant: [],
  };

  const categoryMap = new Map<ExpenseCategory, { total: number; count: number }>();
  const applicantMap = new Map<string, { total: number; count: number }>();

  for (const expense of expenses) {
    switch (expense.status) {
      case 'approved':
        summary.approvedTotal += expense.amount;
        summary.approvedCount += 1;
        break;
      case 'pending':
        summary.pendingTotal += expense.amount;
        summary.pendingCount += 1;
        break;
      case 'rejected':
        summary.rejectedTotal += expense.amount;
        break;
      default:
        summary.draftTotal += expense.amount;
    }

    // カテゴリ別・人別は「承認済み」だけを家計の実績として集計する
    if (expense.status === 'approved') {
      const c = categoryMap.get(expense.category) ?? { total: 0, count: 0 };
      categoryMap.set(expense.category, { total: c.total + expense.amount, count: c.count + 1 });
      const a = applicantMap.get(expense.applicantUserId) ?? { total: 0, count: 0 };
      applicantMap.set(expense.applicantUserId, {
        total: a.total + expense.amount,
        count: a.count + 1,
      });
    }
  }

  summary.byCategory = [...categoryMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total);
  summary.byApplicant = [...applicantMap.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.total - a.total);

  return { summary, expenses };
}

export async function createExpense(params: {
  familyId: string;
  userId: string;
  input: ExpenseFormInput;
  submit: boolean;
}): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const ref = await expensesCol(params.familyId).add({
    ...expenseInputToDocument(params.input),
    familyId: params.familyId,
    applicantUserId: params.userId,
    status: params.submit ? 'pending' : 'draft',
    adminComment: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  logger.info('経費を作成しました', {
    userId: params.userId,
    familyId: params.familyId,
    action: params.submit ? 'expense.create_and_submit' : 'expense.create_draft',
    expenseId: ref.id,
  });
  return ref.id;
}

/**
 * 経費の更新。
 * transaction で「現在の状態」を読んでから書く。
 * 読んでから書くまでの間に admin が承認した場合、書き込みは失敗して
 * 「すでに処理済みです」になる (Lost Update の防止)。
 */
export async function updateExpense(params: {
  familyId: string;
  expenseId: string;
  userId: string;
  input: ExpenseFormInput;
  submit: boolean;
}): Promise<void> {
  const db = getDb();
  const ref = expenseDoc(params.familyId, params.expenseId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('経費が見つかりません。');
    const current = toExpense(snap.id, params.familyId, snap.data() ?? {});

    if (current.applicantUserId !== params.userId) {
      throw forbidden('自分が作成した経費のみ編集できます。');
    }
    if (current.status === 'approved' || current.status === 'pending') {
      throw conflict('申請済み・承認済みの経費は編集できません。');
    }

    tx.update(ref, {
      ...expenseInputToDocument(params.input),
      status: params.submit ? 'pending' : 'draft',
      // 却下されたものを再申請するときはコメントと審査記録をリセットする
      ...(params.submit ? { adminComment: null, reviewedBy: null, reviewedAt: null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/** 下書き / 却下 -> 承認待ち */
export async function submitExpense(params: {
  familyId: string;
  expenseId: string;
  userId: string;
}): Promise<Expense> {
  const db = getDb();
  const ref = expenseDoc(params.familyId, params.expenseId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('経費が見つかりません。');
    const current = toExpense(snap.id, params.familyId, snap.data() ?? {});

    if (!canSubmitExpense({ userId: params.userId, expense: current })) {
      throw conflict('この経費は申請できません。');
    }

    tx.update(ref, {
      status: 'pending',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ...current, status: 'pending' as ExpenseStatus };
  });
}

/** 承認待ち -> 下書き (申請者による取り下げ) */
export async function withdrawExpense(params: {
  familyId: string;
  expenseId: string;
  userId: string;
}): Promise<void> {
  const db = getDb();
  const ref = expenseDoc(params.familyId, params.expenseId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('経費が見つかりません。');
    const current = toExpense(snap.id, params.familyId, snap.data() ?? {});
    if (!canWithdrawExpense({ userId: params.userId, expense: current })) {
      throw conflict('この経費は取り下げできません。');
    }
    tx.update(ref, { status: 'draft', updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * 承認 / 却下。
 *
 * ここが「クライアントから status を書き換えるだけでは承認できない」ことを
 * 保証する場所。
 *   1. Firestore Security Rules がクライアントからの status 変更を禁止
 *   2. この関数を呼べるのは Server Action だけ (サーバー側で role を検証)
 *   3. transaction で「pending のときだけ」書き換える
 *      (2 人の admin が同時に押しても片方だけが成功する)
 */
export async function reviewExpense(params: {
  familyId: string;
  expenseId: string;
  reviewerUserId: string;
  reviewerRole: Role;
  decision: 'approved' | 'rejected';
  adminComment: string;
}): Promise<Expense> {
  const db = getDb();
  const ref = expenseDoc(params.familyId, params.expenseId);

  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('経費が見つかりません。');
    const current = toExpense(snap.id, params.familyId, snap.data() ?? {});

    assertCanReviewExpense({
      role: params.reviewerRole,
      userId: params.reviewerUserId,
      expense: current,
    });

    tx.update(ref, {
      status: params.decision,
      adminComment: params.adminComment || null,
      reviewedBy: params.reviewerUserId,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ...current,
      status: params.decision,
      adminComment: params.adminComment || null,
      reviewedBy: params.reviewerUserId,
      reviewedAt: new Date().toISOString(),
    } satisfies Expense;
  });

  logger.info('経費を審査しました', {
    userId: params.reviewerUserId,
    familyId: params.familyId,
    action: `expense.${params.decision}`,
    expenseId: params.expenseId,
    // 金額・店舗名はログに出さない
  });

  return updated;
}

export async function deleteExpense(params: {
  familyId: string;
  expenseId: string;
  userId: string;
  role: Role;
}): Promise<void> {
  const ref = expenseDoc(params.familyId, params.expenseId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound('経費が見つかりません。');
  const current = toExpense(snap.id, params.familyId, snap.data() ?? {});

  if (!canDeleteExpense({ role: params.role, userId: params.userId, expense: current })) {
    throw forbidden('この経費は削除できません。');
  }

  await ref.delete();

  if (current.receiptStoragePath) {
    try {
      await deleteObject({ storagePath: current.receiptStoragePath, familyId: params.familyId });
    } catch (error) {
      logger.error('領収書の削除に失敗しました', error, {
        familyId: params.familyId,
        action: 'expense.delete_receipt',
      });
    }
  }
}

/** 直近 N か月分の月別合計 (承認済み) */
export async function getMonthlyTotals(params: {
  familyId: string;
  monthKeys: string[];
}): Promise<Record<string, number>> {
  const results = await Promise.all(
    params.monthKeys.map(async (monthKey) => {
      const snap = await expensesCol(params.familyId)
        .where('yearMonth', '==', monthKey)
        .where('status', '==', 'approved')
        .get();
      const total = snap.docs.reduce((sum, doc) => sum + num(doc.data().amount, 0), 0);
      return [monthKey, total] as const;
    }),
  );
  return Object.fromEntries(results);
}
