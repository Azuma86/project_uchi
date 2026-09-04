import type { NextConfig } from 'next';

/**
 * Cloud Run 向けの Next.js 設定。
 *
 * - output: 'standalone'
 *   必要な node_modules だけを .next/standalone にまとめてくれるため、
 *   Docker イメージが小さくなる (= Artifact Registry の保存料金と
 *   Cloud Run のコールドスタート時間を減らせる)。
 * - images.unoptimized
 *   写真は Cloud Storage の署名付き URL から直接配信する。
 *   next/image の最適化サーバーを通すと Cloud Run の CPU / メモリを
 *   消費する (= 課金される) ため、あえて無効化している。
 *   詳細は docs/adr/003-storage.md を参照。
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  experimental: {
    // Server Actions 経由のアップロードは行わない (署名付き URL を使う) ので小さめで十分
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
