'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminAccess, requireFamilyAccess } from '@/lib/auth/session';
import {
  createExpense,
  deleteExpense,
  getExpense,
  reviewExpense,
  submitExpense,
  updateExpense,
  withdrawExpense,
} from '@/lib/data/expenses';
import { listMembers } from '@/lib/data/families';
import {
  createExpenseSchema,
  expenseIdSchema,
  reviewExpenseSchema,
  updateExpenseSchema,
} from '@/lib/validation/schemas';
import { checkbox, field, toFormState, type FormState } from '@/lib/actions';
import { parseYenInput } from '@/lib/format';
import { assertCanEditExpense } from '@/lib/permissions';
import { forbidden, notFound } from '@/lib/errors';
import { verifyUploadedObject } from '@/lib/storage/gcs';
import { isPathOwnedByFamily } from '@/lib/storage/paths';
import { notifySafely } from '@/lib/notifications';
import { formatYen } from '@/lib/format';
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from '@/lib/types';
import { logger } from '@/lib/logging/logger';

/**
 * 経費申請の Server Action。
 *
 * 承認・却下がクライアントから直接行えないことを保証する層。
 *   - status を書き換えられるのは、この関数を通ったときだけ
 *   - Firestore 側でも Security Rules が admin 以外の status 変更を拒否する
 *   - 実際の更新は transaction で「pending のときだけ」行う
 */

function readExpenseForm(formData: FormData) {
  return {
    purchaseDate: field(formData, 'purchaseDate'),
    merchant: field(formData, 'merchant'),
    amount: parseYenInput(field(formData, 'amount')) ?? Number.NaN,
    category: field(formData, 'category'),
    description: field(formData, 'description'),
    receiptStoragePath: field(formData, 'receiptStoragePath') || null,
  };
}

/** 領収書が指定されている場合、実物の存在とサイズ・形式を検証する */
async function verifyReceipt(familyId: string, receiptStoragePath: string | null): Promise<void> {
  if (!receiptStoragePath) return;
  if (!isPathOwnedByFamily(receiptStoragePath, familyId)) {
    throw forbidden('領収書の保存先が正しくありません。');
  }
  await verifyUploadedObject({ storagePath: receiptStoragePath, familyId, kind: 'receipt' });
}

export async function createExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let expenseId = '';
  try {
    const parsed = createExpenseSchema.safeParse({
      familyId: field(formData, 'familyId'),
      expense: readExpenseForm(formData),
      submit: checkbox(formData, 'submit'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    await verifyReceipt(session.familyId, parsed.data.expense.receiptStoragePath ?? null);

    expenseId = await createExpense({
      familyId: session.familyId,
      userId: session.userId,
      input: parsed.data.expense,
      submit: parsed.data.submit,
    });

    if (parsed.data.submit) {
      await notifyAdminsOfSubmission({
        familyId: session.familyId,
        applicantName: session.displayName,
        amount: parsed.data.expense.amount,
        category: parsed.data.expense.category as ExpenseCategory,
        expenseId,
      });
    }
  } catch (error) {
    return toFormState(error, { action: 'expense.create' });
  }

  revalidatePath('/expenses');
  revalidatePath('/home');
  redirect(`/expenses/${expenseId}`);
}

export async function updateExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let expenseId = '';
  try {
    const parsed = updateExpenseSchema.safeParse({
      familyId: field(formData, 'familyId'),
      expenseId: field(formData, 'expenseId'),
      expense: readExpenseForm(formData),
      submit: checkbox(formData, 'submit'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    const session = await requireFamilyAccess(parsed.data.familyId);
    expenseId = parsed.data.expenseId;

    const existing = await getExpense({ familyId: session.familyId, expenseId });
    if (!existing) throw notFound('経費が見つかりません。');
    // 申請済み (pending) 以降は申請者でも編集できない
    assertCanEditExpense({ role: session.role, userId: session.userId, expense: existing });

    await verifyReceipt(session.familyId, parsed.data.expense.receiptStoragePath ?? null);

    await updateExpense({
      familyId: session.familyId,
      expenseId,
      userId: session.userId,
      input: parsed.data.expense,
      submit: parsed.data.submit,
    });

    if (parsed.data.submit) {
      await notifyAdminsOfSubmission({
        familyId: session.familyId,
        applicantName: session.displayName,
        amount: parsed.data.expense.amount,
        category: parsed.data.expense.category as ExpenseCategory,
        expenseId,
      });
    }
  } catch (error) {
    return toFormState(error, { action: 'expense.update' });
  }

  revalidatePath('/expenses');
  revalidatePath('/home');
  redirect(`/expenses/${expenseId}`);
}

/** 下書き -> 申請 */
export async function submitExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = expenseIdSchema.safeParse({
      familyId: field(formData, 'familyId'),
      expenseId: field(formData, 'expenseId'),
    });
    if (!parsed.success) return { error: '入力内容を確認してください。' };

    const session = await requireFamilyAccess(parsed.data.familyId);
    const expense = await submitExpense({
      familyId: session.familyId,
      expenseId: parsed.data.expenseId,
      userId: session.userId,
    });

    await notifyAdminsOfSubmission({
      familyId: session.familyId,
      applicantName: session.displayName,
      amount: expense.amount,
      category: expense.category,
      expenseId: expense.id,
    });

    revalidatePath('/expenses');
    revalidatePath('/home');
    return { success: '申請しました。管理者の承認をお待ちください。' };
  } catch (error) {
    return toFormState(error, { action: 'expense.submit' });
  }
}

/** 申請の取り下げ (pending -> draft) */
export async function withdrawExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = expenseIdSchema.safeParse({
      familyId: field(formData, 'familyId'),
      expenseId: field(formData, 'expenseId'),
    });
    if (!parsed.success) return { error: '入力内容を確認してください。' };

    const session = await requireFamilyAccess(parsed.data.familyId);
    await withdrawExpense({
      familyId: session.familyId,
      expenseId: parsed.data.expenseId,
      userId: session.userId,
    });

    revalidatePath('/expenses');
    revalidatePath('/home');
    return { success: '申請を取り下げました。' };
  } catch (error) {
    return toFormState(error, { action: 'expense.withdraw' });
  }
}

/**
 * 承認 / 却下 (管理者のみ)。
 * requireAdminAccess で role を検証したうえで、
 * さらに transaction 内でも pending であることを確認する。
 */
export async function reviewExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = reviewExpenseSchema.safeParse({
      familyId: field(formData, 'familyId'),
      expenseId: field(formData, 'expenseId'),
      decision: field(formData, 'decision'),
      adminComment: field(formData, 'adminComment'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
    }

    // ここで admin でなければ 403 になる
    const session = await requireAdminAccess(parsed.data.familyId);

    const expense = await reviewExpense({
      familyId: session.familyId,
      expenseId: parsed.data.expenseId,
      reviewerUserId: session.userId,
      reviewerRole: session.role,
      decision: parsed.data.decision as 'approved' | 'rejected',
      adminComment: parsed.data.adminComment ?? '',
    });

    await notifySafely({
      type: parsed.data.decision === 'approved' ? 'expense.approved' : 'expense.rejected',
      familyId: session.familyId,
      recipients: [{ userId: expense.applicantUserId }],
      title:
        parsed.data.decision === 'approved' ? '経費が承認されました' : '経費が却下されました',
      body: `${EXPENSE_CATEGORY_LABEL[expense.category]} ${formatYen(expense.amount)}`,
      path: `/expenses/${expense.id}`,
    });

    revalidatePath('/expenses');
    revalidatePath('/home');
    return {
      success: parsed.data.decision === 'approved' ? '承認しました。' : '却下しました。',
    };
  } catch (error) {
    return toFormState(error, { action: 'expense.review' });
  }
}

export async function deleteExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = expenseIdSchema.safeParse({
      familyId: field(formData, 'familyId'),
      expenseId: field(formData, 'expenseId'),
    });
    if (!parsed.success) return { error: '入力内容を確認してください。' };

    const session = await requireFamilyAccess(parsed.data.familyId);
    await deleteExpense({
      familyId: session.familyId,
      expenseId: parsed.data.expenseId,
      userId: session.userId,
      role: session.role,
    });

    logger.info('経費を削除しました', {
      userId: session.userId,
      familyId: session.familyId,
      action: 'expense.delete',
    });
  } catch (error) {
    return toFormState(error, { action: 'expense.delete' });
  }

  revalidatePath('/expenses');
  revalidatePath('/home');
  redirect('/expenses');
}

/** 管理者へ「申請がありました」を通知する (初期版はログ出力のみ) */
async function notifyAdminsOfSubmission(params: {
  familyId: string;
  applicantName: string;
  amount: number;
  category: ExpenseCategory;
  expenseId: string;
}): Promise<void> {
  const members = await listMembers(params.familyId);
  const admins = members.filter((member) => member.role === 'admin');

  await notifySafely({
    type: 'expense.submitted',
    familyId: params.familyId,
    recipients: admins.map((admin) => ({ userId: admin.userId })),
    title: '経費の承認依頼があります',
    body: `${params.applicantName} さん / ${EXPENSE_CATEGORY_LABEL[params.category]} ${formatYen(
      params.amount,
    )}`,
    path: `/expenses/${params.expenseId}`,
  });
}
