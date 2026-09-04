import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { listExpenses } from '@/lib/data/expenses';
import { listMembers } from '@/lib/data/families';
import { AppHeader } from '@/components/nav/app-header';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ExpenseRow } from '@/features/expenses/expense-row';
import { ButtonLink } from '@/components/ui/button';
import { formatYen } from '@/lib/format';

export const metadata: Metadata = { title: '承認待ち' };
export const dynamic = 'force-dynamic';

/**
 * 管理者向けの承認待ち一覧。
 *
 * ページ側でも role を確認してリダイレクトするが、
 * 実際の承認処理は Server Action 側で requireAdminAccess を通るため、
 * この画面を直接開けたとしても承認はできない。
 */
export default async function ReviewPage() {
  const session = await requireSession();
  if (session.role !== 'admin') {
    redirect('/expenses');
  }

  const [pending, members] = await Promise.all([
    listExpenses({ familyId: session.familyId, status: 'pending', limit: 100 }),
    listMembers(session.familyId),
  ]);

  const memberNames = Object.fromEntries(members.map((m) => [m.userId, m.displayName]));
  const total = pending.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <>
      <AppHeader session={session} title="承認待ち" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs text-ink-faint">承認待ちの合計</p>
            <p className="tabular mt-1 text-2xl font-bold text-warn">{formatYen(total)}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{pending.length}件</p>
          </div>

          <Card>
            <CardHeader title="承認待ちの経費" />
            {pending.length === 0 ? (
              <EmptyState icon="✅" title="承認待ちの経費はありません" />
            ) : (
              <ul className="divide-y divide-line">
                {pending.map((expense) => (
                  <li key={expense.id}>
                    <ExpenseRow
                      expense={expense}
                      applicantName={memberNames[expense.applicantUserId]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="text-center text-xs text-ink-faint">
            各経費をタップすると領収書を確認して承認・却下できます
          </p>

          <ButtonLink href="/expenses" variant="ghost" size="lg">
            経費一覧に戻る
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
