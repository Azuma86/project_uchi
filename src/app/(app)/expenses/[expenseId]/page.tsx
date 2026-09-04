import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getExpense } from '@/lib/data/expenses';
import { listMembers } from '@/lib/data/families';
import { createReadUrl } from '@/lib/storage/gcs';
import { AppHeader } from '@/components/nav/app-header';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { formatJstDate, formatJstDateTime } from '@/lib/datetime';
import { formatYen } from '@/lib/format';
import { EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_LABEL } from '@/lib/types';
import {
  canDeleteExpense,
  canEditExpense,
  canReviewExpense,
  canSubmitExpense,
  canViewReceipt,
  canWithdrawExpense,
} from '@/lib/permissions';
import { ExpenseActionsPanel } from '@/features/expenses/expense-actions-panel';

export const metadata: Metadata = { title: '経費' };
export const dynamic = 'force-dynamic';

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const session = await requireSession();
  const { expenseId } = await params;

  // familyId スコープで取得するので、他家族の ID を渡しても見つからない
  const expense = await getExpense({ familyId: session.familyId, expenseId });
  if (!expense) notFound();

  const members = await listMembers(session.familyId);
  const applicant = members.find((m) => m.userId === expense.applicantUserId);
  const reviewer = expense.reviewedBy
    ? members.find((m) => m.userId === expense.reviewedBy)
    : null;

  // 下書きは本人以外に見せない
  if (expense.status === 'draft' && expense.applicantUserId !== session.userId) {
    notFound();
  }

  const receiptVisible =
    Boolean(expense.receiptStoragePath) &&
    canViewReceipt({ role: session.role, userId: session.userId, expense });

  // 領収書の署名付き URL は「見てよい人」にだけ発行する
  const receiptUrl =
    receiptVisible && expense.receiptStoragePath
      ? await createReadUrl({
          storagePath: expense.receiptStoragePath,
          familyId: session.familyId,
        })
      : null;

  const permissions = {
    canSubmit: canSubmitExpense({ userId: session.userId, expense }),
    canWithdraw: canWithdrawExpense({ userId: session.userId, expense }),
    canEdit: canEditExpense({ role: session.role, userId: session.userId, expense }),
    canDelete: canDeleteExpense({ role: session.role, userId: session.userId, expense }),
    canReview: canReviewExpense({ role: session.role, userId: session.userId, expense }),
  };

  return (
    <>
      <AppHeader session={session} title="経費の詳細" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink-faint">
                  {EXPENSE_CATEGORY_EMOJI[expense.category]}{' '}
                  {EXPENSE_CATEGORY_LABEL[expense.category]}
                </p>
                <p className="tabular mt-1 text-3xl font-bold text-ink">
                  {formatYen(expense.amount)}
                </p>
              </div>
              <StatusBadge status={expense.status} />
            </div>

            <dl className="mt-5 flex flex-col gap-3 text-[15px]">
              <Row label="店舗">{expense.merchant}</Row>
              <Row label="購入日">{formatJstDate(expense.purchaseDate)}</Row>
              <Row label="申請者">{applicant?.displayName ?? '不明'}</Row>
              {expense.description ? (
                <Row label="内容">
                  <span className="whitespace-pre-wrap">{expense.description}</span>
                </Row>
              ) : null}
              {expense.reviewedAt ? (
                <Row label="審査">
                  {expense.status === 'approved' ? '承認' : '却下'} ・{' '}
                  {reviewer?.displayName ?? '管理者'}
                  <br />
                  <span className="text-sm text-ink-faint">
                    {formatJstDateTime(expense.reviewedAt)}
                  </span>
                </Row>
              ) : null}
              {expense.adminComment ? (
                <Row label="コメント">
                  <span className="whitespace-pre-wrap">{expense.adminComment}</span>
                </Row>
              ) : null}
            </dl>
          </Card>

          {expense.receiptStoragePath ? (
            receiptUrl ? (
              <Card className="overflow-hidden">
                <p className="border-b border-line px-4 py-2 text-sm font-medium text-ink-soft">
                  領収書
                </p>
                <img src={receiptUrl} alt="領収書" className="max-h-[70vh] w-full object-contain" />
              </Card>
            ) : (
              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-faint">
                領収書は申請者本人と管理者のみ閲覧できます。
              </p>
            )
          ) : null}

          <ExpenseActionsPanel familyId={session.familyId} expenseId={expense.id} {...permissions} />

          <ButtonLink href="/expenses" variant="ghost" size="lg">
            経費一覧に戻る
          </ButtonLink>
        </div>
      </main>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-sm text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{children}</dd>
    </div>
  );
}
