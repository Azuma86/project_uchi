/**
 * アプリ共通のエラー型。
 *
 * Server Action / Route Handler から投げられたエラーをそのまま画面へ出すと
 * 内部構造が漏れるため、「ユーザーに見せてよいメッセージ」を持つ AppError と、
 * それ以外 (想定外の例外) を区別する。
 */

export type AppErrorCode =
  | 'unauthenticated' // ログインしていない
  | 'forbidden' // 権限がない (別家族 / role 不足)
  | 'not_found' // 対象が存在しない (IDOR 対策として forbidden と区別せず返す場合もある)
  | 'invalid_input' // バリデーションエラー
  | 'conflict' // 状態が競合 (すでに承認済みなど)
  | 'rate_limited'
  | 'internal';

const STATUS: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** 画面にそのまま表示してよいメッセージか */
  readonly safeMessage: string;

  constructor(code: AppErrorCode, safeMessage: string, options?: { cause?: unknown }) {
    super(safeMessage, options);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.safeMessage = safeMessage;
  }
}

export function unauthenticated(message = 'ログインが必要です。'): AppError {
  return new AppError('unauthenticated', message);
}

export function forbidden(message = 'この操作を行う権限がありません。'): AppError {
  return new AppError('forbidden', message);
}

export function notFound(message = '対象が見つかりません。'): AppError {
  return new AppError('not_found', message);
}

export function invalidInput(message = '入力内容を確認してください。'): AppError {
  return new AppError('invalid_input', message);
}

export function conflict(message = '状態が変わっています。画面を更新してください。'): AppError {
  return new AppError('conflict', message);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Server Action の戻り値として使う結果型 (例外を投げずに画面へ返す) */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: AppErrorCode; fieldErrors?: Record<string, string[]> };

export function actionOk(): ActionResult<void>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data: data as T };
}

export function actionError(error: unknown): ActionResult<never> {
  if (isAppError(error)) {
    return { ok: false, error: error.safeMessage, code: error.code };
  }
  return {
    ok: false,
    error: '処理に失敗しました。時間をおいて再度お試しください。',
    code: 'internal',
  };
}
