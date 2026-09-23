import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full min-h-[46px] rounded-xl border border-line bg-surface px-3 py-2 text-[16px] text-ink ' +
  'placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ' +
  'disabled:bg-surface-muted disabled:text-ink-faint';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-soft">
        {label}
        {required ? <span className="ml-1 text-danger">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-[92px] resize-y', className)} {...props} />;
}

/**
 * セレクトボックス。
 *
 * OS 既定の矢印は見た目がバラバラなので appearance-none で消し、
 * 自前の ∨ アイコンを背景に描いている
 * (画像ファイルを増やさないよう SVG を data URI で埋め込む)。
 */
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23546073' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 7.5 5 5 5-5'/%3E%3C/svg%3E\")";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(CONTROL, 'appearance-none bg-no-repeat pr-10', className)}
      style={{
        backgroundImage: SELECT_CHEVRON,
        backgroundPosition: 'right 12px center',
        backgroundSize: '18px 18px',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent">
      {message}
    </p>
  );
}
