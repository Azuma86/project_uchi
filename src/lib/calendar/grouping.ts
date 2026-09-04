import type { CalendarEvent } from '@/lib/types';
import { jstDayKey, startOfJstDayUtc } from '@/lib/datetime';

/**
 * 日付キー ("2026-09-04") ごとに予定をまとめる。
 * 複数日にまたがる予定は、またぐ日すべてに現れる。
 *
 * カーソルを「JST のその日の 0:00」に正規化してから 24 時間ずつ進める。
 * JST はサマータイムが無いので 24 時間 = ちょうど 1 日になる。
 *
 * (サーバー依存が無い純粋関数なので、単体テストで検証している)
 */
export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const DAY_MS = 24 * 60 * 60 * 1000;
  // 異常なデータで無限ループしないための上限 (1 予定あたり最大 400 日)
  const MAX_DAYS = 400;

  for (const event of events) {
    // 終端は排他 (終日予定の endAt は翌日 0:00) なので 1ms 戻す
    const endMs = new Date(event.endAt).getTime() - 1;
    let cursorMs = startOfJstDayUtc(event.startAt).getTime();
    let guard = 0;

    while (cursorMs <= endMs && guard < MAX_DAYS) {
      const key = jstDayKey(new Date(cursorMs));
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
      cursorMs += DAY_MS;
      guard += 1;
    }
  }

  // 各日の中では「終日 → 開始時刻順」に並べる
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.localeCompare(b.startAt);
    });
  }
  return map;
}
