import type { MetadataRoute } from 'next';
import {
  APP_BRAND_COLOR,
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
  APP_THEME_COLOR,
} from '@/lib/constants';

/**
 * PWA マニフェスト。
 *
 * これがあると iPhone / Android で「ホーム画面に追加」でき、
 * アドレスバーの無いアプリのような表示 (standalone) になる。
 *
 * - display: 'standalone'  … ブラウザ UI を隠す
 * - start_url: '/'         … 起動時はセッションに応じて振り分けられる
 * - maskable アイコン      … Android の丸/角丸マスクで切れないアイコン
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — 予定・写真・経費`,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: APP_THEME_COLOR,
    theme_color: APP_BRAND_COLOR,
    lang: 'ja',
    dir: 'ltr',
    categories: ['lifestyle', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'カレンダー', url: '/calendar' },
      { name: 'アルバム', url: '/album' },
      { name: '経費を作成', url: '/expenses/new' },
    ],
  };
}
