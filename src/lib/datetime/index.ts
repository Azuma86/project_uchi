import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { APP_TIME_ZONE } from '@/lib/constants';

/**
 * 日時ユーティリティ。
 *
 * ルール:
 *   - Firestore / Cloud Storage など保存側の日時はすべて UTC。
 *   - 画面表示と入力フォームはすべて Asia/Tokyo (JST)。
 *   - 変換処理をアプリ中に散らかさず、必ずこのモジュールを通す。
 *
 * なぜ「ブラウザのローカル時刻」を使わないのか:
 *   海外旅行中のスマホや、UTC で動く Cloud Run の Server Component では
 *   ローカル時刻がバラバラになる。家族アプリの「9月4日の予定」は
 *   常に日本時間の 9月4日であってほしいので、タイムゾーンを固定する。
 */

export const TZ = APP_TIME_ZONE;

export function nowIso(): string {
  return new Date().toISOString();
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** UTC の瞬間を JST の壁掛け時計に変換した Date (表示・分解用) */
export function toJst(value: Date | string): Date {
  return toZonedTime(toDate(value), TZ);
}

/** "2026-09-04" のような JST の日付キー */
export function jstDayKey(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'yyyy-MM-dd');
}

/** "2026-09" のような JST の年月キー (経費の月次集計に使う) */
export function jstMonthKey(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'yyyy-MM');
}

/** 2026年9月4日 */
export function formatJstDate(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'yyyy年M月d日', { locale: ja });
}

/** 9月4日(木) */
export function formatJstDateWithWeekday(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'M月d日(E)', { locale: ja });
}

/** 14:30 */
export function formatJstTime(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'HH:mm');
}

/** 2026年9月4日 14:30 */
export function formatJstDateTime(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'yyyy年M月d日 HH:mm', { locale: ja });
}

/** 2026年9月 */
export function formatJstMonth(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'yyyy年M月', { locale: ja });
}

/** <input type="date"> 用の値 (JST 基準) */
export function toDateInputValue(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, 'yyyy-MM-dd');
}

/** <input type="datetime-local"> 用の値 (JST 基準) */
export function toDateTimeInputValue(value: Date | string): string {
  return formatInTimeZone(toDate(value), TZ, "yyyy-MM-dd'T'HH:mm");
}

/**
 * フォーム入力 ("2026-09-04" / "2026-09-04T14:30") を JST の壁掛け時刻として
 * 解釈し、UTC の Date へ変換する。
 * 端末のタイムゾーン設定に依存しないのが重要。
 */
export function jstInputToUtc(input: string): Date {
  const normalized = input.length === 10 ? `${input}T00:00:00` : input;
  return fromZonedTime(normalized, TZ);
}

/** JST のその日の 0:00 を UTC で返す (Firestore の範囲クエリ用) */
export function startOfJstDayUtc(value: Date | string): Date {
  return fromZonedTime(`${jstDayKey(value)}T00:00:00`, TZ);
}

/** JST のその日の 24:00 (= 翌日 0:00) を UTC で返す。範囲クエリの上限は「未満」で使う。 */
export function endOfJstDayUtc(value: Date | string): Date {
  return addDays(startOfJstDayUtc(value), 1);
}

/** "2026-09" の月初 0:00 (JST) を UTC で返す */
export function startOfJstMonthUtc(monthKey: string): Date {
  return fromZonedTime(`${monthKey}-01T00:00:00`, TZ);
}

/** "2026-09" の翌月初 0:00 (JST) を UTC で返す */
export function endOfJstMonthUtc(monthKey: string): Date {
  return startOfJstMonthUtc(shiftMonthKey(monthKey, 1));
}

/**
 * "2026-09" → "2026-10" / "2026-08"
 *
 * date-fns の addMonths を使わないのはなぜか:
 *   addMonths は「実行環境のローカルタイムゾーンの壁掛け時計」で月を進める。
 *   startOfJstMonthUtc("2026-12") は 2026-11-30T15:00Z (JST 12/1 0:00) なので、
 *   UTC で動く環境 (Cloud Run / CI) では「11月30日」の +1 か月 = 12月30日 となり、
 *   JST では 12月31日、つまり月キーが "2026-12" のまま進まない。
 *   JST の端末では偶然正しく動くため、ローカルでは気付けない。
 *   年月の加減算に時刻は要らないので、数値計算だけで完結させる。
 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearPart, monthPart] = monthKey.split('-');
  const totalMonths = Number(yearPart) * 12 + (Number(monthPart) - 1) + delta;
  const shiftedYear = Math.floor(totalMonths / 12);
  const shiftedMonth = (((totalMonths % 12) + 12) % 12) + 1;
  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** 今日 (JST) の日付キー */
export function todayJstDayKey(): string {
  return jstDayKey(new Date());
}

/** 今月 (JST) の年月キー */
export function currentJstMonthKey(): string {
  return jstMonthKey(new Date());
}

export type CalendarCell = {
  /** "2026-09-04" */
  dayKey: string;
  /** その月に含まれるか (前後月のグレー表示判定) */
  inCurrentMonth: boolean;
  isToday: boolean;
  dayOfMonth: number;
  /** 0=日曜 .. 6=土曜 */
  weekday: number;
};

/**
 * 月表示カレンダー用の 6 週 × 7 日グリッドを作る。
 * 週の開始は日曜 (日本のカレンダー慣習)。
 */
export function buildMonthGrid(monthKey: string): CalendarCell[] {
  const monthStartUtc = startOfJstMonthUtc(monthKey);
  const monthStartJst = toJst(monthStartUtc);
  const gridStartJst = startOfWeek(monthStartJst, { weekStartsOn: 0 });
  const today = todayJstDayKey();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cellJst = addDays(gridStartJst, i);
    // gridStartJst は「JST の壁掛け時刻を持つ Date」なので、日付部分をそのまま読む
    const y = cellJst.getFullYear();
    const m = String(cellJst.getMonth() + 1).padStart(2, '0');
    const d = String(cellJst.getDate()).padStart(2, '0');
    const dayKey = `${y}-${m}-${d}`;
    cells.push({
      dayKey,
      inCurrentMonth: dayKey.startsWith(monthKey),
      isToday: dayKey === today,
      dayOfMonth: cellJst.getDate(),
      weekday: cellJst.getDay(),
    });
  }
  return cells;
}

/** 「今日」「明日」「3日後」のような相対表現 (ホーム画面用) */
export function relativeDayLabel(value: Date | string): string {
  const diff = differenceInCalendarDays(toJst(value), toJst(new Date()));
  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  if (diff === 2) return '明後日';
  if (diff < 0) return formatJstDateWithWeekday(value);
  if (diff <= 7) return `${diff}日後`;
  return formatJstDateWithWeekday(value);
}

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;
