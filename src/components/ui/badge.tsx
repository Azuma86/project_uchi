import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ExpenseStatus, Role } from '@/lib/types';
import { EXPENSE_STATUS_LABEL, ROLE_LABEL } from '@/lib/types';

const STATUS_STYLE: Record<ExpenseStatus, string> = {
  draft: 'bg-surface-muted text-ink-soft border-line',
  pending: 'bg-warn-soft text-warn border-warn/30',
  approved: 'bg-accent-soft text-accent border-accent/30',
  rejected: 'bg-danger-soft text-danger border-danger/30',
};

export function StatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_STYLE[status],
      )}
    >
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        role === 'admin'
          ? 'border-info/30 bg-info-soft text-info'
          : 'border-line bg-surface-muted text-ink-soft',
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'accent';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'brand' && 'bg-brand-soft text-brand-dark',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'neutral' && 'bg-surface-muted text-ink-soft',
      )}
    >
      {children}
    </span>
  );
}
