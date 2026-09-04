'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/components/nav/nav-items';
import { cn } from '@/lib/cn';

/**
 * スマートフォン用の下部ナビゲーション。
 *
 * - 親指が届く画面下部に配置する
 * - iPhone のホームインジケータと重ならないよう safe-area を確保する
 * - 各項目の高さは 56px 以上 (タップしやすさ)
 */
export function BottomNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showBadge = item.href === '/expenses' && pendingCount > 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  active ? 'text-brand' : 'text-ink-faint',
                )}
              >
                <span className="relative">
                  {item.icon}
                  {showBadge ? (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
