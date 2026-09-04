'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CalendarEvent } from '@/lib/types';
import { WEEKDAY_LABELS, formatJstDateWithWeekday, todayJstDayKey } from '@/lib/datetime';
import { cn } from '@/lib/cn';
import { EventRow } from '@/features/calendar/event-row';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';

export type CalendarCellData = {
  dayKey: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  dayOfMonth: number;
  weekday: number;
};

/**
 * 月表示カレンダー。
 *
 * 日付の選択はクライアント側の状態で行う。
 * サーバーへ問い合わせ直さないので、Firestore の read が増えず表示も速い。
 * (その月の予定はページ表示時に 1 回だけまとめて取得済み)
 */
export function MonthCalendar({
  cells,
  eventsByDay,
  memberNames,
  initialSelectedDay,
}: {
  cells: CalendarCellData[];
  eventsByDay: Record<string, CalendarEvent[]>;
  memberNames: Record<string, string>;
  initialSelectedDay: string;
}) {
  const [selectedDay, setSelectedDay] = useState(initialSelectedDay);
  const today = todayJstDayKey();

  const selectedEvents = useMemo(
    () => eventsByDay[selectedDay] ?? [],
    [eventsByDay, selectedDay],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-2">
        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label, index) => (
            <div
              key={label}
              className={cn(
                'py-1.5 text-center text-xs font-medium',
                index === 0 && 'text-danger',
                index === 6 && 'text-info',
                index > 0 && index < 6 && 'text-ink-faint',
              )}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px">
          {cells.map((cell) => {
            const dayEvents = eventsByDay[cell.dayKey] ?? [];
            const selected = cell.dayKey === selectedDay;
            return (
              <button
                key={cell.dayKey}
                type="button"
                onClick={() => setSelectedDay(cell.dayKey)}
                aria-pressed={selected}
                aria-label={`${cell.dayKey} ${dayEvents.length}件の予定`}
                className={cn(
                  'flex min-h-[52px] flex-col items-center gap-1 rounded-lg py-1.5 transition-colors',
                  selected ? 'bg-brand text-white' : 'hover:bg-surface-muted',
                  !selected && !cell.inCurrentMonth && 'text-ink-faint/60',
                  !selected && cell.inCurrentMonth && cell.weekday === 0 && 'text-danger',
                  !selected && cell.inCurrentMonth && cell.weekday === 6 && 'text-info',
                  !selected && cell.inCurrentMonth && cell.weekday > 0 && cell.weekday < 6 && 'text-ink',
                )}
              >
                <span
                  className={cn(
                    'tabular flex h-6 w-6 items-center justify-center rounded-full text-sm',
                    cell.dayKey === today && !selected && 'bg-brand-soft font-bold text-brand-dark',
                    selected && 'font-bold',
                  )}
                >
                  {cell.dayOfMonth}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        selected ? 'bg-white/80' : 'bg-brand/70',
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">
            {formatJstDateWithWeekday(`${selectedDay}T00:00:00Z`)}
          </h2>
          <ButtonLink href={`/calendar/new?date=${selectedDay}`} size="sm">
            + 予定を追加
          </ButtonLink>
        </div>

        {selectedEvents.length === 0 ? (
          <EmptyState icon="🗓" title="予定はありません" />
        ) : (
          <ul className="divide-y divide-line">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <EventRow event={event} memberNames={memberNames} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-center text-xs text-ink-faint">
        日付をタップするとその日の予定が表示されます
      </p>
      <Link href="/calendar" className="sr-only">
        今月に戻る
      </Link>
    </div>
  );
}
