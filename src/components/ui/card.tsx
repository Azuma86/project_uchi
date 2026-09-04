import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export function Card({
  children,
  className,
  as = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  const Tag = as;
  return (
    <Tag className={cn('rounded-2xl border border-line bg-surface', className)}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  action,
  icon,
}: {
  title: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function CardLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'block rounded-2xl border border-line bg-surface transition-colors hover:bg-surface-muted active:bg-surface-muted',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description ? <p className="text-sm text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
