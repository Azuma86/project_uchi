import { NextResponse, type NextRequest } from 'next/server';
import { requireFamilyAccess } from '@/lib/auth/session';
import { downloadObject } from '@/lib/storage/gcs';
import { isEmulator } from '@/lib/firebase/admin';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

/**
 * 画像配信 (Firebase Emulator 利用時のみ)。
 *
 * 本番では Cloud Storage の署名付き URL をブラウザへ直接返すため、
 * このエンドポイントは使わない (Cloud Run を画像が通らない方が速く・安い)。
 * Storage エミュレータが署名付き URL に対応していないので、
 * ローカル開発でだけアプリ経由で配信する。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isEmulator) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const storagePath = request.nextUrl.searchParams.get('path') ?? '';
  const match = /^families\/([A-Za-z0-9_-]+)\//.exec(storagePath);
  if (!match) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  try {
    // パスに含まれる familyId が本人の所属家族かを必ず確認する (IDOR 対策)
    await requireFamilyAccess(match[1]!);
    const { buffer, contentType } = await downloadObject({
      storagePath,
      familyId: match[1]!,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    const status = isAppError(error) ? error.status : 500;
    if (status >= 500) {
      logger.error('画像の配信に失敗しました', error, { action: 'media.get' });
    }
    return NextResponse.json({ error: 'forbidden' }, { status });
  }
}
