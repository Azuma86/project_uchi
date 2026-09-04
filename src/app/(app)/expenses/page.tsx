import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { getMonthlySummary } from '@/lib/data/expenses';
import { listMembers } from '@/lib/data/families';
import {
  currentJstMonthKey,
  formatJstMonth,
  isValidMonthKey,
  shiftMonthKey,
} from '@/lib/datetime';
import { formatYen } from '@/lib/format';
import { AppHeader } from '@/components/nav/app-header';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { ExpenseRow } from '@/features/expenses/expense-row';
import {
  EXPENSE_CATEGORY_EMOJI,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABEL,
  type ExpenseStatus,
} from '@/lib/types';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: '経費' };
export const dynamic = 'force-dynamic';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string; mine?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const monthKey =
    params.month && isValidMonthKey(params.month) ? params.month : currentJstMonthKey();
  const statusFilter = EXPENSE_STATUSES.includes(params.status as ExpenseStatus)
    ? (params.status as ExpenseStatus)
    : null;
  const mineOnly = params.mine === '1';

  /*
   * その月の経費を 1 クエリで取得し、集計と一覧の両方に使う。
   * 「集計用のドキュメントを別に持つ」方式より単純で、
   * 家族数人・月数十件という規模では read も十分少ない。
   * (設計判断の詳細は README「経費集計の設計判断」を参照)
   */
  const [{ summary, expenses }, members] = await Promise.all([
    getMonthlySummary({
      familyId: session.familyId,
      yearMonth: monthKey,
      userId: session.userId,
      role: session.role,
    }),
    listMembers(session.familyId),
  ]);

  const memberNames = Object.fromEntries(members.map((m) => [m.userId, m.displayName]));

  const filtered = expenses.filter((expense) => {
    if (statusFilter && expense.status !== statusFilter) return false;
    if (mineOnly && expense.applicantUserId !== session.userId) return false;
    return true;
  });

  const buildHref = (next: { status?: string | null; mine?: boolean; month?: string }) => {
    const search = new URLSearchParams();
    search.set('month', next.month ?? monthKey);
    const status = next.status === undefined ? statusFilter : next.status;
    if (status) search.set('status', status);
    const mine = next.mine === undefined ? mineOnly : next.mine;
    if (mine) search.set('mine', '1');
    return `/expenses?${search.toString()}`;
  };

  return (
    <>
      <AppHeader session={session} title="経費" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex flex-col gap-4">
          {/* 月の切り替え */}
          <nav className="flex items-center justify-between" aria-label="月の切り替え">
            <MonthLink href={buildHref({ month: shiftMonthKey(monthKey, -1) })} arrow="‹" label="前の月" />
            <h2 className="text-lg font-bold text-ink">
              {formatJstMonth(`${monthKey}-01T00:00:00Z`)}
            </h2>
            <MonthLink href={buildHref({ month: shiftMonthKey(monthKey, 1) })} arrow="›" label="次の月" />
          </nav>

          {/* 集計 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs text-ink-faint">承認済み合計</p>
              <p className="tabular mt-1 text-xl font-bold text-ink">
                {formatYen(summary.approvedTotal)}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">{summary.approvedCount}件</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs text-ink-faint">承認待ち合計</p>
              <p className="tabular mt-1 text-xl font-bold text-warn">
                {formatYen(summary.pendingTotal)}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">{summary.pendingCount}件</p>
            </div>
          </div>

          {session.role === 'admin' && summary.pendingCount > 0 ? (
            <ButtonLink href="/expenses/review" size="lg">
              承認待ちを確認する ({summary.pendingCount}件)
            </ButtonLink>
          ) : null}

          {/* カテゴリ別 */}
          {summary.byCategory.length > 0 ? (
            <Card>
              <CardHeader title="カテゴリ別 (承認済み)" />
              <ul className="flex flex-col gap-2 p-4">
                {summary.byCategory.map((row) => {
                  const ratio =
                    summary.approvedTotal > 0 ? row.total / summary.approvedTotal : 0;
                  return (
                    <li key={row.category} className="flex items-center gap-3">
                      <span className="w-6 text-center" aria-hidden>
                        {EXPENSE_CATEGORY_EMOJI[row.category]}
                      </span>
                      <span className="w-16 shrink-0 text-sm text-ink-soft">
                        {EXPENSE_CATEGORY_LABEL[row.category]}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <span
                          className="block h-full rounded-full bg-brand/70"
                          style={{ width: `${Math.max(4, Math.round(ratio * 100))}%` }}
                        />
                      </span>
                      <span className="tabular w-20 shrink-0 text-right text-sm font-medium text-ink">
                        {formatYen(row.total)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {/* 絞り込み */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip href={buildHref({ status: null })} active={!statusFilter}>
              すべて
            </FilterChip>
            {EXPENSE_STATUSES.map((status) => (
              <FilterChip
                key={status}
                href={buildHref({ status })}
                active={statusFilter === status}
              >
                {EXPENSE_STATUS_LABEL[status]}
              </FilterChip>
            ))}
            <FilterChip href={buildHref({ mine: !mineOnly })} active={mineOnly}>
              自分の申請
            </FilterChip>
          </div>

          {/* 一覧 */}
          <Card>
            <CardHeader title={`${formatJstMonth(`${monthKey}-01T00:00:00Z`)}の経費`} />
            {filtered.length === 0 ? (
              <EmptyState
                icon="🧾"
                title="該当する経費はありません"
                description="買い物の領収書を登録して申請できます"
                action={
                  <ButtonLink href="/expenses/new" size="sm">
                    経費を作成
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((expense) => (
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

          <div className="pb-4">
            <ButtonLink href="/expenses/new" size="lg">
              + 経費を作成する
            </ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}

function MonthLink({ href, arrow, label }: { href: string; arrow: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-ink-soft transition-colors hover:bg-surface-muted"
    >
      {arrow}
    </Link>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-surface text-ink-soft hover:bg-surface-muted',
      )}
    >
      {children}
    </Link>
  );
}
