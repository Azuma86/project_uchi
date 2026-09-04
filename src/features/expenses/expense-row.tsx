import Link from 'next/link';
import type { Expense } from '@/lib/types';
import { EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_LABEL } from '@/lib/types';
import { formatYen } from '@/lib/format';
import { formatJstDate } from '@/lib/datetime';
import { StatusBadge } from '@/components/ui/badge';

/** 経費 1 件の行 */
export function ExpenseRow({
  expense,
  applicantName,
  showApplicant = true,
}: {
  expense: Expense;
  applicantName?: string;
  showApplicant?: boolean;
}) {
  return (
    <Link
      href={`/expenses/${expense.id}`}
      className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted active:bg-surface-muted"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-lg"
        aria-hidden
      >
        {EXPENSE_CATEGORY_EMOJI[expense.category]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium text-ink">{expense.merchant}</p>
          <StatusBadge status={expense.status} />
        </div>
        <p className="truncate text-xs text-ink-faint">
          {formatJstDate(expense.purchaseDate)} ・ {EXPENSE_CATEGORY_LABEL[expense.category]}
          {showApplicant && applicantName ? ` ・ ${applicantName}` : ''}
          {expense.receiptStoragePath ? ' ・ 🧾' : ''}
        </p>
      </div>

      <span className="tabular shrink-0 text-[15px] font-semibold text-ink">
        {formatYen(expense.amount)}
      </span>
    </Link>
  );
}
