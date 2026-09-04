import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { groupEventsByDay, listEventsForMonth } from '@/lib/data/events';
import { listMembers } from '@/lib/data/families';
import {
  buildMonthGrid,
  currentJstMonthKey,
  formatJstMonth,
  isValidMonthKey,
  shiftMonthKey,
  todayJstDayKey,
} from '@/lib/datetime';
import { AppHeader } from '@/components/nav/app-header';
import { MonthCalendar } from '@/features/calendar/month-calendar';
import type { CalendarEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'カレンダー' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const monthKey =
    params.month && isValidMonthKey(params.month) ? params.month : currentJstMonthKey();

  // その月の予定とメンバー一覧を並列で取得
  const [events, members] = await Promise.all([
    listEventsForMonth({ familyId: session.familyId, monthKey }),
    listMembers(session.familyId),
  ]);

  const grouped = groupEventsByDay(events);
  const eventsByDay: Record<string, CalendarEvent[]> = {};
  for (const [dayKey, list] of grouped) eventsByDay[dayKey] = list;

  const memberNames = Object.fromEntries(members.map((m) => [m.userId, m.displayName]));
  const cells = buildMonthGrid(monthKey);

  const today = todayJstDayKey();
  const initialSelectedDay =
    params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)
      ? params.day
      : today.startsWith(monthKey)
        ? today
        : `${monthKey}-01`;

  return (
    <>
      <AppHeader session={session} title="カレンダー" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <nav className="mb-4 flex items-center justify-between" aria-label="月の切り替え">
          <MonthLink monthKey={shiftMonthKey(monthKey, -1)} label="前の月" arrow="‹" />
          <h2 className="text-lg font-bold text-ink">{formatJstMonth(`${monthKey}-01T00:00:00Z`)}</h2>
          <MonthLink monthKey={shiftMonthKey(monthKey, 1)} label="次の月" arrow="›" />
        </nav>

        <MonthCalendar
          cells={cells}
          eventsByDay={eventsByDay}
          memberNames={memberNames}
          initialSelectedDay={initialSelectedDay}
        />
      </main>
    </>
  );
}

function MonthLink({
  monthKey,
  label,
  arrow,
}: {
  monthKey: string;
  label: string;
  arrow: string;
}) {
  return (
    <Link
      href={`/calendar?month=${monthKey}`}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-ink-soft transition-colors hover:bg-surface-muted"
    >
      {arrow}
    </Link>
  );
}
