'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/components/nav/nav-items';
import { AppMark } from '@/components/ui/app-mark';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';
import type { SessionContext } from '@/lib/types';

/** PC 用のサイドバー。モバイルでは Bottom Nav に切り替わる。 */
export function Sidebar({
  session,
  pendingCount = 0,
}: {
  session: SessionContext;
  pendingCount?: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <AppMark size={32} />
        <span className="text-lg font-bold tracking-tight text-ink">{APP_NAME}</span>
      </div>

      <nav aria-label="メインナビゲーション" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showBadge = item.href === '/expenses' && pendingCount > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
                    active
                      ? 'bg-brand-soft text-brand-dark'
                      : 'text-ink-soft hover:bg-surface-muted',
                  )}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {showBadge ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-3 border-t border-line px-4 py-4">
        <Avatar displayName={session.displayName} photoUrl={session.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{session.displayName}</p>
          <p className="truncate text-xs text-ink-faint">{session.familyName}</p>
        </div>
      </div>
    </aside>
  );
}
