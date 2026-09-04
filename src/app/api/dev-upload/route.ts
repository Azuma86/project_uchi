import { NextResponse, type NextRequest } from 'next/server';
import { requireFamilyAccess } from '@/lib/auth/session';
import { saveObjectFromBuffer } from '@/lib/storage/gcs';
import { isEmulator } from '@/lib/firebase/admin';
import { ALLOWED_STORED_MIME, MAX_BYTES_BY_KIND } from '@/lib/validation/upload';
import { pathKind } from '@/lib/storage/paths';
import { isAppError } from '@/lib/errors';

/**
 * アップロード受け口 (Firebase Emulator 利用時のみ)。
 *
 * 本番では Cloud Storage の署名付き URL へブラウザが直接 PUT するので
 * このエンドポイントは 404 を返す。
 * Storage エミュレータが署名付き URL に対応していないため、
 * ローカル開発でだけ同じインターフェース (PUT) を提供している。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  if (!isEmulator) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const storagePath = request.nextUrl.searchParams.get('path') ?? '';
  const match = /^families\/([A-Za-z0-9_-]+)\//.exec(storagePath);
  const kind = pathKind(storagePath);
  if (!match || !kind) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!(ALLOWED_STORED_MIME as readonly string[]).includes(contentType)) {
    return NextResponse.json({ error: 'unsupported content type' }, { status: 415 });
  }

  try {
    await requireFamilyAccess(match[1]!);

    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES_BY_KIND[kind]) {
      return NextResponse.json({ error: 'file too large' }, { status: 413 });
    }

    await saveObjectFromBuffer({
      storagePath,
      familyId: match[1]!,
      contentType,
      buffer,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = isAppError(error) ? error.status : 500;
    return NextResponse.json({ error: 'upload failed' }, { status });
  }
}
