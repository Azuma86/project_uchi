import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { listTodayEvents, listUpcomingEvents } from '@/lib/data/events';
import { countPendingExpenses, getMonthlyTotals } from '@/lib/data/expenses';
import { listPhotos } from '@/lib/data/photos';
import { createReadUrls } from '@/lib/storage/gcs';
import { currentJstMonthKey, formatJstDate, formatJstMonth } from '@/lib/datetime';
import { formatYen } from '@/lib/format';
import { AppHeader } from '@/components/nav/app-header';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { EventRow } from '@/features/calendar/event-row';
import { PhotoThumb } from '@/features/album/photo-thumb';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'ホーム' };
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireSession();
  const monthKey = currentJstMonthKey();

  /*
   * 必要なデータを並列で取得する。
   * 直列にすると Cloud Run のリクエスト時間が伸びて課金も増えるため、
   * 依存関係のない読み取りは必ず Promise.all でまとめる。
   */
  const [todayEvents, upcomingEvents, pendingCount, monthlyTotals, recentPhotos] = await Promise.all([
    listTodayEvents(session.familyId),
    listUpcomingEvents({ familyId: session.familyId, limit: 4 }),
    countPendingExpenses(session.familyId),
    getMonthlyTotals({ familyId: session.familyId, monthKeys: [monthKey] }),
    listPhotos({ familyId: session.familyId, limit: 6 }),
  ]);

  const photoUrls = await createReadUrls({
    familyId: session.familyId,
    storagePaths: recentPhotos.map((photo) => photo.thumbnailStoragePath ?? photo.storagePath),
  });

  // 今日の予定は「今後の予定」から除く (重複表示を避ける)
  const todayIds = new Set(todayEvents.map((event) => event.id));
  const upcoming = upcomingEvents.filter((event) => !todayIds.has(event.id)).slice(0, 3);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex flex-col gap-4">
          <section className="animate-in">
            <p className="text-sm text-ink-soft">{formatJstDate(new Date())}</p>
            <h2 className="mt-0.5 text-xl font-bold text-ink">
              こんにちは、{session.displayName}さん
            </h2>
          </section>

          {/* 今月の家計サマリー */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/expenses"
              className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-muted"
            >
              <p className="text-xs text-ink-faint">{formatJstMonth(new Date())}の承認済み</p>
              <p className="tabular mt-1 text-xl font-bold text-ink">
                {formatYen(monthlyTotals[monthKey] ?? 0)}
              </p>
            </Link>
            <Link
              href="/expenses?status=pending"
              className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-muted"
            >
              <p className="text-xs text-ink-faint">承認待ち</p>
              <p className="tabular mt-1 text-xl font-bold text-ink">
                {pendingCount}
                <span className="ml-1 text-sm font-medium text-ink-soft">件</span>
              </p>
            </Link>
          </div>

          {/* 今日の予定 */}
          <Card>
            <CardHeader
              title="今日の予定"
              action={
                <Link href="/calendar" className="text-sm font-medium text-brand">
                  カレンダー
                </Link>
              }
            />
            {todayEvents.length === 0 ? (
              <EmptyState icon="☀️" title="今日の予定はありません" />
            ) : (
              <ul className="divide-y divide-line">
                {todayEvents.map((event) => (
                  <li key={event.id}>
                    <EventRow event={event} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 今後の予定 */}
          {upcoming.length > 0 ? (
            <Card>
              <CardHeader title="このあとの予定" />
              <ul className="divide-y divide-line">
                {upcoming.map((event) => (
                  <li key={event.id}>
                    <EventRow event={event} showDate />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* 最近の写真 */}
          <Card>
            <CardHeader
              title="最近の写真"
              action={
                <Link href="/album" className="text-sm font-medium text-brand">
                  アルバム
                </Link>
              }
            />
            {recentPhotos.length === 0 ? (
              <EmptyState
                icon="📷"
                title="まだ写真がありません"
                description="家族の思い出を追加しましょう"
                action={
                  <ButtonLink href="/album" size="sm" variant="secondary">
                    写真を追加
                  </ButtonLink>
                }
              />
            ) : (
              <div className="grid grid-cols-3 gap-1.5 p-3 sm:grid-cols-6">
                {recentPhotos.map((photo) => (
                  <PhotoThumb
                    key={photo.id}
                    href={`/album/photo/${photo.id}`}
                    src={photoUrls[photo.thumbnailStoragePath ?? photo.storagePath]}
                    caption={photo.caption}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* ショートカット */}
          <div className="grid grid-cols-2 gap-3 pb-4">
            <ShortcutLink href="/calendar/new" emoji="🗓" label="予定を追加" />
            <ShortcutLink href="/album?upload=1" emoji="📸" label="写真を追加" />
            <ShortcutLink href="/expenses/new" emoji="🧾" label="経費を申請" />
            {session.role === 'admin' ? (
              <ShortcutLink href="/expenses/review" emoji="✅" label="経費を承認" />
            ) : (
              <ShortcutLink href="/settings" emoji="⚙️" label="設定" />
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function ShortcutLink({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-[15px] font-medium text-ink transition-colors hover:bg-surface-muted active:bg-surface-muted"
    >
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      {label}
    </Link>
  );
}
