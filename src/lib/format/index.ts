import { APP_CURRENCY } from '@/lib/constants';

/**
 * 表示フォーマット関連。
 * 金額は日本円 (小数なし) として扱う。内部では常に「整数の円」で保持する。
 */

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: APP_CURRENCY,
  maximumFractionDigits: 0,
});

/** 4580 -> "¥4,580" */
export function formatYen(amount: number): string {
  return currencyFormatter.format(Math.round(amount));
}

/** 4580 -> "4,580" (入力欄の補助表示など) */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

/** "¥4,580" / "4,580円" / "4580" のような入力から整数の円を取り出す */
export function parseYenInput(input: string): number | null {
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\d-]/g, '');
  if (normalized === '' || normalized === '-') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

/** 1536000 -> "1.5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 名前からアバター用のイニシャル (日本語なら先頭 1 文字) */
export function initials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '？';
  return [...trimmed][0] ?? '？';
}

/** 長い文字列を省略 */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
