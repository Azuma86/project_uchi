import { NextResponse } from 'next/server';

/**
 * ヘルスチェック用エンドポイント。
 *
 * Cloud Run のスタートアップ・liveness プローブや、
 * Cloud Monitoring の Uptime Check から叩く想定。
 * 認証を必要としないが、内部情報は返さない。
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', time: new Date().toISOString() });
}
