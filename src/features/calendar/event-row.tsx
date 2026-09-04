import Link from 'next/link';
import type { CalendarEvent } from '@/lib/types';
import { formatJstTime, relativeDayLabel } from '@/lib/datetime';
import { Chip } from '@/components/ui/badge';

/** 予定 1 件の行。カレンダーとホームの両方で使う。 */
export function EventRow({
  event,
  showDate = false,
  memberNames,
}: {
  event: CalendarEvent;
  showDate?: boolean;
  memberNames?: Record<string, string>;
}) {
  const assignee = event.assignedUserId ? memberNames?.[event.assignedUserId] : null;

  return (
    <Link
      href={`/calendar/${event.id}`}
      className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted active:bg-surface-muted"
    >
      <div className="w-16 shrink-0 text-center">
        {event.allDay ? (
          <span className="text-xs font-medium text-ink-soft">終日</span>
        ) : (
          <span className="tabular text-sm font-semibold text-ink">{formatJstTime(event.startAt)}</span>
        )}
        {showDate ? (
          <p className="text-[11px] text-ink-faint">{relativeDayLabel(event.startAt)}</p>
        ) : null}
      </div>

      <span className="h-8 w-1 shrink-0 rounded-full bg-brand/60" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{event.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {assignee ? <Chip tone="brand">{assignee}</Chip> : null}
          {event.location ? (
            <span className="truncate text-xs text-ink-faint">📍 {event.location}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
