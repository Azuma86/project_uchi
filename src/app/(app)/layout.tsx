import { requireSession } from '@/lib/auth/session';
import { countPendingExpenses } from '@/lib/data/expenses';
import { BottomNav } from '@/components/nav/bottom-nav';
import { Sidebar } from '@/components/nav/sidebar';
import { SessionProvider } from '@/components/providers/session-provider';
import { RuntimeConfigProvider } from '@/components/providers/firebase-provider';
import { getPublicRuntimeConfig } from '@/lib/firebase/client-config';

/**
 * ログイン済みユーザー向けの共通レイアウト。
 *
 * ここで requireSession() を呼ぶことで、配下のすべてのページが
 * 「ログイン済み かつ 家族に所属している」ことを保証できる。
 * 個々のページで認証チェックを書き忘れる事故を防ぐ。
 *
 * 承認待ち件数はナビゲーションのバッジに使う。
 * aggregate query の count() なのでドキュメントは読まない (安い)。
 */
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const pendingCount = await countPendingExpenses(session.familyId);

  return (
    <RuntimeConfigProvider config={getPublicRuntimeConfig()}>
      <SessionProvider session={session}>
      <div className="flex min-h-dvh">
        <Sidebar session={session} pendingCount={pendingCount} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 pb-[calc(58px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
        </div>
      </div>
        <BottomNav pendingCount={pendingCount} />
      </SessionProvider>
    </RuntimeConfigProvider>
  );
}
