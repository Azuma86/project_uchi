import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { listMembers } from '@/lib/data/families';
import { EventForm } from '@/features/calendar/event-form';
import { AppHeader } from '@/components/nav/app-header';
import { isValidDayKey } from '@/lib/datetime';

export const metadata: Metadata = { title: '予定を追加' };
export const dynamic = 'force-dynamic';

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const members = await listMembers(session.familyId);
  const defaultDate = params.date && isValidDayKey(params.date) ? params.date : undefined;

  return (
    <>
      <AppHeader session={session} title="予定を追加" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <EventForm familyId={session.familyId} members={members} defaultDate={defaultDate} />
      </main>
    </>
  );
}
