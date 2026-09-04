import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildMonthGrid,
  endOfJstDayUtc,
  endOfJstMonthUtc,
  formatJstDate,
  formatJstDateTime,
  formatJstMonth,
  isValidDayKey,
  isValidMonthKey,
  jstDayKey,
  jstInputToUtc,
  jstMonthKey,
  relativeDayLabel,
  shiftMonthKey,
  startOfJstDayUtc,
  startOfJstMonthUtc,
  toDateInputValue,
} from '@/lib/datetime';

/**
 * 日時ユーティリティのテスト。
 *
 * ここが壊れると「予定が 1 日ずれる」「経費が前月に計上される」といった
 * 分かりにくいバグになるため、UTC と JST の境界を重点的に確認する。
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('JST と UTC の変換', () => {
  it('UTC の 15:00 は JST では翌日の 0:00 になる', () => {
    // 2026-09-03T15:00:00Z = 2026-09-04T00:00:00+09:00
    expect(jstDayKey('2026-09-03T15:00:00.000Z')).toBe('2026-09-04');
  });

  it('UTC の 14:59 はまだ JST では同日中', () => {
    expect(jstDayKey('2026-09-03T14:59:59.000Z')).toBe('2026-09-03');
  });

  it('JST の日付キーから月キーを求められる', () => {
    // JST では 2026-10-01 なので月キーは 2026-10
    expect(jstMonthKey('2026-09-30T15:30:00.000Z')).toBe('2026-10');
  });

  it('フォーム入力 (JST の壁掛け時刻) を UTC に変換する', () => {
    expect(jstInputToUtc('2026-09-04T09:00').toISOString()).toBe('2026-09-04T00:00:00.000Z');
  });

  it('日付だけの入力は JST の 0:00 として扱う', () => {
    expect(jstInputToUtc('2026-09-04').toISOString()).toBe('2026-09-03T15:00:00.000Z');
  });

  it('端末のタイムゾーンに依存しない', () => {
    // Date のローカルタイムゾーンを使っていたら、この 2 つは違う結果になる
    const fromString = jstInputToUtc('2026-01-15T12:00').toISOString();
    expect(fromString).toBe('2026-01-15T03:00:00.000Z');
  });
});

describe('範囲クエリ用の境界', () => {
  it('JST のその日の 0:00 を UTC で返す', () => {
    expect(startOfJstDayUtc('2026-09-04T10:00:00.000Z').toISOString()).toBe(
      '2026-09-03T15:00:00.000Z',
    );
  });

  it('日の終端は翌日 0:00 (排他)', () => {
    expect(endOfJstDayUtc('2026-09-04T10:00:00.000Z').toISOString()).toBe(
      '2026-09-04T15:00:00.000Z',
    );
  });

  it('月の開始と終了を UTC で返す', () => {
    expect(startOfJstMonthUtc('2026-09').toISOString()).toBe('2026-08-31T15:00:00.000Z');
    expect(endOfJstMonthUtc('2026-09').toISOString()).toBe('2026-09-30T15:00:00.000Z');
  });

  it('月キーを前後に動かせる (年をまたぐ)', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
  });
});

describe('表示フォーマット', () => {
  it('日本語の日付形式で表示する', () => {
    expect(formatJstDate('2026-09-03T15:00:00.000Z')).toBe('2026年9月4日');
  });

  it('日時は JST に変換して表示する', () => {
    expect(formatJstDateTime('2026-09-04T05:30:00.000Z')).toBe('2026年9月4日 14:30');
  });

  it('年月を表示する', () => {
    expect(formatJstMonth('2026-09-01T00:00:00.000Z')).toBe('2026年9月');
  });

  it('input[type=date] 用の値を JST 基準で返す', () => {
    expect(toDateInputValue('2026-09-03T15:00:00.000Z')).toBe('2026-09-04');
  });
});

describe('バリデーション', () => {
  it('月キーの形式を検証する', () => {
    expect(isValidMonthKey('2026-09')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-9')).toBe(false);
    expect(isValidMonthKey('../etc')).toBe(false);
  });

  it('日付キーの形式を検証する', () => {
    expect(isValidDayKey('2026-09-04')).toBe(true);
    expect(isValidDayKey('2026-09-99')).toBe(false);
    expect(isValidDayKey('abcd-ef-gh')).toBe(false);
  });
});

describe('月表示グリッド', () => {
  it('常に 6 週間 (42 日) 分を返す', () => {
    expect(buildMonthGrid('2026-09')).toHaveLength(42);
  });

  it('週の始まりは日曜になる', () => {
    const grid = buildMonthGrid('2026-09');
    expect(grid[0]!.weekday).toBe(0);
    expect(grid[6]!.weekday).toBe(6);
  });

  it('当月の日には inCurrentMonth が立つ', () => {
    const grid = buildMonthGrid('2026-09');
    const inMonth = grid.filter((cell) => cell.inCurrentMonth);
    // 2026年9月は30日
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]!.dayKey).toBe('2026-09-01');
    expect(inMonth.at(-1)!.dayKey).toBe('2026-09-30');
  });

  it('前後の月の日も埋める', () => {
    const grid = buildMonthGrid('2026-09');
    // 2026-09-01 は火曜なので、前月の 8/30(日), 8/31(月) が入る
    expect(grid[0]!.dayKey).toBe('2026-08-30');
    expect(grid[0]!.inCurrentMonth).toBe(false);
  });
});

describe('相対表現', () => {
  it('今日・明日を判定する (JST 基準)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T01:00:00.000Z')); // JST 10:00

    expect(relativeDayLabel('2026-09-04T05:00:00.000Z')).toBe('今日');
    expect(relativeDayLabel('2026-09-05T01:00:00.000Z')).toBe('明日');
    expect(relativeDayLabel('2026-09-06T01:00:00.000Z')).toBe('明後日');
    expect(relativeDayLabel('2026-09-08T01:00:00.000Z')).toBe('4日後');
  });

  it('日付の境界 (JST 24:00 直前) でも今日と判定される', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T14:59:00.000Z')); // JST 23:59
    expect(relativeDayLabel('2026-09-04T13:00:00.000Z')).toBe('今日');
  });
});
