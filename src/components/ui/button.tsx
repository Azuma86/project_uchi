import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark disabled:bg-brand/50',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-muted active:bg-surface-muted',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-muted active:bg-surface-muted',
  danger: 'bg-danger-soft text-danger border border-danger/30 hover:bg-danger/15',
};

const SIZE: Record<Size, string> = {
  // 高さ 44px 以上 = 指でタップしやすい最小サイズ
  sm: 'min-h-[38px] px-3 text-sm rounded-lg',
  md: 'min-h-[44px] px-4 text-[15px] rounded-xl',
  lg: 'min-h-[52px] px-5 text-base rounded-xl w-full',
};

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors ' +
  'disabled:opacity-60 disabled:cursor-not-allowed select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  prefetch,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
    >
      {children}
    </Link>
  );
}
