import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, createSessionCookie } from '@/lib/auth/session';
import { getAuthAdmin } from '@/lib/firebase/admin';
import { ensureUserProfile } from '@/lib/data/families';
import { sessionLoginSchema } from '@/lib/validation/schemas';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logging/logger';
import { isAppError } from '@/lib/errors';

/**
 * ログイン / ログアウト用の Route Handler。
 *
 * ここだけ Server Action ではなく Route Handler にしている理由:
 *   Cookie の発行は「ブラウザで Firebase SDK がログインを終えた直後」に
 *   ID トークンを渡す必要があり、fetch で明示的に呼ぶ方が流れが分かりやすいため。
 *
 * CSRF 対策:
 *   Origin ヘッダが自分自身と一致するかを検証する。
 *   Server Actions は Next.js が同等の検証を自動で行う。
 */

export const runtime = 'nodejs';
// 認証はリクエストごとに必ず実行する (キャッシュしてはいけない)
export const dynamic = 'force-dynamic';

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // fetch は同一オリジンでも Origin を付けることが多いが、
    // 付かない場合は Sec-Fetch-Site で判断する
    const site = request.headers.get('sec-fetch-site');
    return site === 'same-origin' || site === 'none';
  }
  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get('host');
    if (requestHost && originHost === requestHost) return true;
    return originHost === new URL(serverEnv.appUrl).host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    logger.warn('別オリジンからのセッション作成を拒否しました', { action: 'auth.session.csrf' });
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 403 });
  }

  let payload: z.infer<typeof sessionLoginSchema>;
  try {
    payload = sessionLoginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 });
  }

  try {
    const decoded = await getAuthAdmin().verifyIdToken(payload.idToken, true);
    const { value, maxAge } = await createSessionCookie(payload.idToken);

    // 初回ログイン時に users/{uid} を作る
    await ensureUserProfile({
      userId: decoded.uid,
      displayName:
        (typeof decoded.name === 'string' && decoded.name) ||
        decoded.email?.split('@')[0] ||
        'メンバー',
      email: decoded.email ?? null,
      photoUrl: typeof decoded.picture === 'string' ? decoded.picture : null,
    });

    logger.info('ログインしました', { userId: decoded.uid, action: 'auth.login' });

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value,
      maxAge,
      httpOnly: true, // JavaScript から読めない = XSS でトークンを盗まれにくい
      secure: serverEnv.isProduction, // 本番は HTTPS のみ
      sameSite: 'lax', // 他サイトからの POST に Cookie を付けない = CSRF 対策
      path: '/',
    });
    return response;
  } catch (error) {
    const message = isAppError(error)
      ? error.safeMessage
      : 'ログインに失敗しました。もう一度お試しください。';
    logger.warn('セッションの作成に失敗しました', {
      action: 'auth.session.failed',
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/** ログアウト */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: '不正なリクエストです。' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
    httpOnly: true,
    secure: serverEnv.isProduction,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
