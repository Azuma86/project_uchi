import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { AppMark } from '@/components/ui/app-mark';
import { APP_NAME } from '@/lib/constants';
import type { SessionContext } from '@/lib/types';

/**
 * 画面上部のヘッダー。
 * モバイルではページ名とアカウント、PC ではページタイトルを主に表示する。
 * (グループ名はユーザーが設定しないので、ここには出さない)
 */
export function AppHeader({
  session,
  title,
  action,
}: {
  session: SessionContext;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex min-h-[56px] w-full max-w-3xl items-center gap-3 px-4">
        <div className="md:hidden">
          <AppMark size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-ink">{title ?? APP_NAME}</h1>
        </div>
        {action}
        <Link href="/settings" aria-label="設定" className="md:hidden">
          <Avatar displayName={session.displayName} photoUrl={session.photoUrl} size="sm" />
        </Link>
      </div>
    </header>
  );
}
