import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getEvent } from '@/lib/data/events';
import { listMembers } from '@/lib/data/families';
import { EventForm } from '@/features/calendar/event-form';
import { AppHeader } from '@/components/nav/app-header';

export const metadata: Metadata = { title: '予定を編集' };
export const dynamic = 'force-dynamic';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await requireSession();
  const { eventId } = await params;

  const [event, members] = await Promise.all([
    getEvent({ familyId: session.familyId, eventId }),
    listMembers(session.familyId),
  ]);
  if (!event) notFound();

  return (
    <>
      <AppHeader session={session} title="予定を編集" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <EventForm familyId={session.familyId} members={members} event={event} />
      </main>
    </>
  );
}
