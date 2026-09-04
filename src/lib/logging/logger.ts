/**
 * Cloud Logging 向けの構造化ロガー。
 *
 * なぜ必要か:
 *   Cloud Run は「標準出力に出た 1 行」をログエントリとして Cloud Logging へ
 *   自動転送する。このとき JSON を出力すると、Cloud Logging 側が
 *   `severity` や `message` を解釈して検索・フィルタできる jsonPayload に
 *   なる。console.log("文字列") だけだと全部 textPayload の INFO になり、
 *   「エラーだけ抽出」「特定ユーザーの操作を追う」ができない。
 *
 * 個人情報の扱い:
 *   ログには userId / familyId のような「識別子」だけを出し、
 *   メールアドレス・氏名・領収書の中身・金額の明細などは出さない。
 *   ログは Cloud Logging に一定期間保持され、閲覧できる人も増えるため。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Cloud Logging の LogSeverity にマッピングする */
const SEVERITY: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogContext = {
  /** リクエストを一意に識別する ID。1 リクエスト内のログを串刺しで追える。 */
  requestId?: string;
  /** Firebase UID */
  userId?: string;
  /** 操作対象の家族 ID */
  familyId?: string;
  /** 業務上の操作名 (expense.approve など) */
  action?: string;
  /** Cloud Trace と紐付けるための trace ID */
  trace?: string;
  [key: string]: unknown;
};

/** ログに絶対に出してはいけないキー (誤って渡された場合に落とす) */
const REDACTED_KEYS = new Set([
  'password',
  'token',
  'idToken',
  'accessToken',
  'refreshToken',
  'sessionCookie',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'privateKey',
  'email',
  'photoUrl',
  'signedUrl',
  'receiptStoragePath',
  'storagePath',
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 512 ? `${value.slice(0, 512)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVEL_ORDER[level] < minLevel()) return;

  const { trace, ...rest } = context;
  const entry: Record<string, unknown> = {
    severity: SEVERITY[level],
    message,
    time: new Date().toISOString(),
    ...(sanitize(rest) as Record<string, unknown>),
  };

  // Cloud Trace 連携: このフィールドがあるとログが 1 リクエストにまとまる
  if (trace && process.env.GCP_PROJECT_ID) {
    entry['logging.googleapis.com/trace'] =
      `projects/${process.env.GCP_PROJECT_ID}/traces/${trace}`;
  }

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export type Logger = {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  /** 固定のコンテキスト (userId / familyId など) を持つ子ロガーを作る */
  child(context: LogContext): Logger;
};

export function createLogger(base: LogContext = {}): Logger {
  return {
    debug: (message, context) => emit('debug', message, { ...base, ...context }),
    info: (message, context) => emit('info', message, { ...base, ...context }),
    warn: (message, context) => emit('warn', message, { ...base, ...context }),
    error: (message, error, context) =>
      emit('error', message, {
        ...base,
        ...context,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 8).join('\n') }
            : error !== undefined
              ? String(error)
              : undefined,
      }),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger = createLogger({ service: 'uchi-plus' });
