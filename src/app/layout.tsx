import type { Metadata, Viewport } from 'next';
import './globals.css';
import { APP_DESCRIPTION, APP_NAME, APP_THEME_COLOR } from '@/lib/constants';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  // 家族専用の私的アプリなので検索エンジンには載せない
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
  // ピンチズームは許可する (アクセシビリティ)
  maximumScale: 5,
  viewportFit: 'cover',
};

/**
 * ルートレイアウトでは環境変数を読まない。
 *
 * 理由: `next build` 時にエラーページ (404 など) を事前生成する際、
 * ルートレイアウトも実行される。ここで環境変数を必須にすると
 * 「ビルドマシンに本番の設定が無いとビルドできない」ことになってしまう。
 * Firebase の設定は、実際に必要なセグメント
 * ((auth) / onboarding / (app)) のレイアウトで実行時に読む。
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
