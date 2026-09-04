'use client';

import { useEffect } from 'react';

/**
 * Service Worker の登録。
 *
 * PWA として「ホーム画面に追加」できる条件のひとつが
 * 「fetch イベントを持つ Service Worker が登録されていること」。
 * 初期版では高度なオフライン対応はせず、
 *  - 静的アセットのキャッシュ
 *  - オフライン時のフォールバック画面
 * だけを行う (public/sw.js)。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 登録に失敗してもアプリは通常どおり動く
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
