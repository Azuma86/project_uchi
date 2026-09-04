import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { AppHeader } from '@/components/nav/app-header';
import { ExpenseForm } from '@/features/expenses/expense-form';

export const metadata: Metadata = { title: '経費を作成' };
export const dynamic = 'force-dynamic';

export default async function NewExpensePage() {
  const session = await requireSession();
  return (
    <>
      <AppHeader session={session} title="経費を作成" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <ExpenseForm familyId={session.familyId} />
      </main>
    </>
  );
}
