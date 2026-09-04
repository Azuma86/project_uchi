import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getExpense } from '@/lib/data/expenses';
import { createReadUrl } from '@/lib/storage/gcs';
import { AppHeader } from '@/components/nav/app-header';
import { ExpenseForm } from '@/features/expenses/expense-form';
import { canEditExpense } from '@/lib/permissions';

export const metadata: Metadata = { title: '経費を編集' };
export const dynamic = 'force-dynamic';

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const session = await requireSession();
  const { expenseId } = await params;

  const expense = await getExpense({ familyId: session.familyId, expenseId });
  if (!expense) notFound();

  // 申請済み・承認済みは編集不可。URL を直接叩かれても弾く。
  if (!canEditExpense({ role: session.role, userId: session.userId, expense })) {
    redirect(`/expenses/${expenseId}`);
  }

  const receiptUrl = expense.receiptStoragePath
    ? await createReadUrl({ storagePath: expense.receiptStoragePath, familyId: session.familyId })
    : null;

  return (
    <>
      <AppHeader session={session} title="経費を編集" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <ExpenseForm familyId={session.familyId} expense={expense} receiptUrl={receiptUrl} />
      </main>
    </>
  );
}
