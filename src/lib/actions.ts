import 'server-only';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import type { FormState } from '@/lib/form-state';

/**
 * Server Action の共通ヘルパー (サーバー専用)。
 * 型と初期値はクライアントからも使うため @/lib/form-state に置いている。
 */
export type { FormState } from '@/lib/form-state';
export { emptyFormState, formError } from '@/lib/form-state';

/** 例外を FormState へ変換する。想定外の例外は詳細を隠す。 */
export function toFormState(error: unknown, context: Record<string, unknown> = {}): FormState {
  if (isAppError(error)) {
    return { error: error.safeMessage };
  }
  logger.error('Server Action で想定外のエラーが発生しました', error, context);
  return { error: '処理に失敗しました。時間をおいて再度お試しください。' };
}

/** FormData から文字列を安全に取り出す */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === 'on' || value === 'true' || value === '1';
}
