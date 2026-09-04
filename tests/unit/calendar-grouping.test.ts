import { describe, expect, it } from 'vitest';
import { groupEventsByDay } from '@/lib/calendar/grouping';
import type { CalendarEvent } from '@/lib/types';

function event(partial: Partial<CalendarEvent> & { id: string; startAt: string; endAt: string }): CalendarEvent {
  return {
    familyId: 'fam1',
    title: 'テスト予定',
    description: null,
    allDay: false,
    location: null,
    assignedUserId: null,
    createdBy: 'u1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('予定の日別グループ化', () => {
  it('単日の予定はその日にだけ現れる', () => {
    const map = groupEventsByDay([
      event({ id: 'e1', startAt: '2026-09-04T01:00:00.000Z', endAt: '2026-09-04T03:00:00.000Z' }),
    ]);
    expect([...map.keys()]).toEqual(['2026-09-04']);
  });

  it('JST の日付で判定する (UTC では前日でも JST では当日)', () => {
    // 2026-09-03T16:00Z = 2026-09-04 01:00 JST
    const map = groupEventsByDay([
      event({ id: 'e1', startAt: '2026-09-03T16:00:00.000Z', endAt: '2026-09-03T17:00:00.000Z' }),
    ]);
    expect([...map.keys()]).toEqual(['2026-09-04']);
  });

  it('日をまたぐ予定は両方の日に現れる', () => {
    // 9/4 23:00 JST 〜 9/5 01:00 JST
    const map = groupEventsByDay([
      event({ id: 'e1', startAt: '2026-09-04T14:00:00.000Z', endAt: '2026-09-04T16:00:00.000Z' }),
    ]);
    expect([...map.keys()].sort()).toEqual(['2026-09-04', '2026-09-05']);
  });

  it('複数日の終日予定はすべての日に現れる', () => {
    // 9/4 0:00 JST 〜 9/7 0:00 JST (排他) = 9/4,5,6 の 3 日間
    const map = groupEventsByDay([
      event({
        id: 'e1',
        allDay: true,
        startAt: '2026-09-03T15:00:00.000Z',
        endAt: '2026-09-06T15:00:00.000Z',
      }),
    ]);
    expect([...map.keys()].sort()).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
  });

  it('同じ日の予定は「終日が先、その後は開始時刻順」に並ぶ', () => {
    const map = groupEventsByDay([
      event({ id: 'late', startAt: '2026-09-04T05:00:00.000Z', endAt: '2026-09-04T06:00:00.000Z' }),
      event({ id: 'early', startAt: '2026-09-04T01:00:00.000Z', endAt: '2026-09-04T02:00:00.000Z' }),
      event({
        id: 'allday',
        allDay: true,
        startAt: '2026-09-03T15:00:00.000Z',
        endAt: '2026-09-04T15:00:00.000Z',
      }),
    ]);
    expect(map.get('2026-09-04')?.map((e) => e.id)).toEqual(['allday', 'early', 'late']);
  });

  it('予定が無ければ空のマップを返す', () => {
    expect(groupEventsByDay([]).size).toBe(0);
  });
});
