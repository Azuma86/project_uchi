import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getEvent } from '@/lib/data/events';
import { listMembers } from '@/lib/data/families';
import { AppHeader } from '@/components/nav/app-header';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { Chip } from '@/components/ui/badge';
import { formatJstDate, formatJstDateTime, formatJstTime } from '@/lib/datetime';
import { canDeleteEvent } from '@/lib/permissions';
import { DeleteEventButton } from '@/features/calendar/delete-event-button';

export const metadata: Metadata = { title: '予定' };
export const dynamic = 'force-dynamic';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await requireSession();
  const { eventId } = await params;

  const event = await getEvent({ familyId: session.familyId, eventId });
  // 別家族の ID を指定されても familyId スコープで取得しているので見つからない
  if (!event) notFound();

  const members = await listMembers(session.familyId);
  const assignee = event.assignedUserId
    ? members.find((m) => m.userId === event.assignedUserId)
    : null;
  const creator = members.find((m) => m.userId === event.createdBy);
  const canDelete = canDeleteEvent({ role: session.role, userId: session.userId, event });

  return (
    <>
      <AppHeader session={session} title="予定" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="text-xl font-bold text-ink">{event.title}</h2>

            <dl className="mt-4 flex flex-col gap-3 text-[15px]">
              <Row label="日時">
                {event.allDay ? (
                  <span>
                    {formatJstDate(event.startAt)}
                    <span className="ml-2 text-sm text-ink-soft">終日</span>
                  </span>
                ) : (
                  <span>
                    {formatJstDateTime(event.startAt)} 〜 {formatJstTime(event.endAt)}
                  </span>
                )}
              </Row>
              <Row label="担当">
                {assignee ? <Chip tone="brand">{assignee.displayName}</Chip> : <span>みんな</span>}
              </Row>
              {event.location ? <Row label="場所">{event.location}</Row> : null}
              {event.description ? (
                <Row label="メモ">
                  <span className="whitespace-pre-wrap">{event.description}</span>
                </Row>
              ) : null}
              <Row label="作成者">{creator?.displayName ?? '不明'}</Row>
            </dl>
          </Card>

          <div className="flex flex-col gap-2">
            <ButtonLink href={`/calendar/${event.id}/edit`} size="lg" variant="secondary">
              編集する
            </ButtonLink>
            {canDelete ? (
              <DeleteEventButton familyId={session.familyId} eventId={event.id} />
            ) : (
              <p className="text-center text-xs text-ink-faint">
                この予定は作成者または管理者のみ削除できます
              </p>
            )}
            <ButtonLink href="/calendar" size="lg" variant="ghost">
              カレンダーに戻る
            </ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-sm text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{children}</dd>
    </div>
  );
}
