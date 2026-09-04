import 'server-only';
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

/**
 * Firestore の Timestamp と ISO 8601 文字列 (UTC) の相互変換。
 *
 * Server Component から Client Component へ渡せるのはシリアライズ可能な値だけ
 * なので、境界を越える前に必ず文字列へ変換する。
 */

export function tsToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  // サーバータイムスタンプ書き込み直後など、まだ値が無い場合
  return new Date(0).toISOString();
}

export function tsToIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return tsToIso(value);
}

export function isoToTs(value: string | Date): Timestamp {
  return Timestamp.fromDate(typeof value === 'string' ? new Date(value) : value);
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export type Doc = DocumentData;
