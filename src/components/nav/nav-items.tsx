import type { ReactNode } from 'react';

/** ナビゲーションの定義。モバイルの Bottom Nav と PC の Sidebar で共有する。 */
export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/home',
    label: 'ホーム',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <path {...stroke} d="M3 10.5 12 3l9 7.5" />
        <path {...stroke} d="M5.5 9.5V20h13V9.5" />
        <path {...stroke} d="M10 20v-5h4v5" />
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: 'カレンダー',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect {...stroke} x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path {...stroke} d="M3.5 10h17M8 3.5v3M16 3.5v3" />
      </svg>
    ),
  },
  {
    href: '/album',
    label: 'アルバム',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect {...stroke} x="3.5" y="5" width="17" height="14" rx="3" />
        <circle {...stroke} cx="9" cy="10" r="1.6" />
        <path {...stroke} d="m4.5 17 4.2-4.2a2 2 0 0 1 2.8 0L16 17.5" />
        <path {...stroke} d="m14 15 1.8-1.8a2 2 0 0 1 2.8 0l1.9 1.9" />
      </svg>
    ),
  },
  {
    href: '/expenses',
    label: '経費',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <path {...stroke} d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-3-1.6L7.5 20 6 20.5z" />
        <path {...stroke} d="M9 8.5h6M9 12h6M9 15.5h3" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: '設定',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <circle {...stroke} cx="12" cy="12" r="3" />
        <path
          {...stroke}
          d="M19.4 13.6a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1A2 2 0 1 1 4.2 15.5l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V1.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1.1z"
          transform="translate(0 1.2) scale(0.92) translate(1 0.4)"
        />
      </svg>
    ),
  },
];
