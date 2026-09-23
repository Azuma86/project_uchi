import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAuthAdmin, getDb } from '@/lib/firebase/admin';
import { serverEnv } from '@/lib/env';
import { forbidden, unauthenticated } from '@/lib/errors';
import type { Family, FamilyMember, Role, SessionContext, UserProfile } from '@/lib/types';
import { str, strOrNull, tsToIso } from '@/lib/firebase/converters';
import { logger } from '@/lib/logging/logger';

/**
 * 認証セッションの取り扱い。
 *
 * 方式: Firebase Auth の ID トークン → セッション Cookie
 *
 *   ブラウザ                     Cloud Run (Next.js)
 *   ───────                     ────────────────────
 *   Firebase SDK でログイン
 *   idToken を取得
 *        │ POST /api/auth/session
 *        ▼
 *                              Admin SDK が idToken を検証
 *                              createSessionCookie() で Cookie を発行
 *        ◀── Set-Cookie: __session (HttpOnly)
 *
 * なぜ ID トークンを直接使わないのか:
 *   - ID トークンは 1 時間で失効するため、Server Component から毎回
 *     クライアントに更新させる必要があり扱いにくい。
 *   - localStorage に置くと XSS で盗まれる。HttpOnly Cookie なら
 *     JavaScript から読めないので XSS への耐性が上がる。
 *   - セッション Cookie は Firebase 側で失効させられる (revokeRefreshTokens)。
 *
 * CSRF 対策:
 *   - SameSite=Lax でクロスサイトからの POST に Cookie が付かない。
 *   - Server Actions は Next.js が Origin ヘッダを検証する。
 *   - /api/auth/session は Origin を明示的にチェックする。
 */

export const SESSION_COOKIE_NAME = '__session';

export async function createSessionCookie(idToken: string): Promise<{ value: string; maxAge: number }> {
  const auth = getAuthAdmin();
  // まず ID トークンを検証する。checkRevoked=true でログアウト済みトークンを弾く。
  const decoded = await auth.verifyIdToken(idToken, true);

  // 発行直後のトークンのみ受け付ける (盗まれた古いトークンでのセッション作成を防ぐ)
  const authTimeMs = decoded.auth_time * 1000;
  if (Date.now() - authTimeMs > 5 * 60 * 1000) {
    throw unauthenticated('ログインの有効期限が切れています。もう一度ログインしてください。');
  }

  const expiresInMs = serverEnv.sessionMaxAgeSeconds * 1000;
  const value = await auth.createSessionCookie(idToken, { expiresIn: expiresInMs });
  return { value, maxAge: serverEnv.sessionMaxAgeSeconds };
}

/**
 * Cookie からログインユーザーを取得する。未ログインなら null。
 * React の cache() で 1 リクエスト内の重複検証を防ぐ。
 */
export const getCurrentUser = cache(async (): Promise<DecodedIdToken | null> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    // checkRevoked=true は Firebase Auth へ 1 回問い合わせる。
    // 家族数人の規模なら無視できるコストで、退会・パスワード変更時に
    // 即座にセッションを無効化できるメリットの方が大きい。
    return await getAuthAdmin().verifySessionCookie(sessionCookie, true);
  } catch (error) {
    logger.debug('セッション Cookie の検証に失敗しました', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
});

export async function requireUser(): Promise<DecodedIdToken> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** users/{uid} を取得し、無ければ Firebase Auth の情報から作る */
export const getUserProfile = cache(async (userId: string): Promise<UserProfile | null> => {
  const snap = await getDb().collection('users').doc(userId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    displayName: str(data.displayName, 'メンバー'),
    email: strOrNull(data.email),
    photoUrl: strOrNull(data.photoUrl),
    familyIds: Array.isArray(data.familyIds) ? (data.familyIds as string[]) : [],
    lastActiveFamilyId: strOrNull(data.lastActiveFamilyId),
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
});

/**
 * 「ログイン済み」かつ「どこかの家族に所属している」状態を組み立てる。
 *
 * Firestore の read 回数:
 *   users/{uid} (1) + families/{fid} (1) + members/{uid} (1) = 3 read。
 *   React cache() により 1 リクエスト内では 1 回しか実行されない。
 *   users/{uid}.familyIds を非正規化しているおかげで
 *   「所属家族を探すための collectionGroup クエリ」が不要になっている。
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getUserProfile(user.uid);
  if (!profile || profile.familyIds.length === 0) return null;

  const db = getDb();
  const activeFamilyId =
    profile.lastActiveFamilyId && profile.familyIds.includes(profile.lastActiveFamilyId)
      ? profile.lastActiveFamilyId
      : profile.familyIds[0]!;

  const [familySnap, memberSnap] = await Promise.all([
    db.collection('families').doc(activeFamilyId).get(),
    db.collection('families').doc(activeFamilyId).collection('members').doc(user.uid).get(),
  ]);

  if (!familySnap.exists || !memberSnap.exists) {
    // users.familyIds と実際のメンバー情報がずれている (家族から外された等)
    logger.warn('所属情報の不整合を検出しました', {
      userId: user.uid,
      familyId: activeFamilyId,
    });
    return null;
  }

  const familyData = familySnap.data() ?? {};
  const memberData = memberSnap.data() ?? {};
  const role = (memberData.role === 'admin' ? 'admin' : 'member') as Role;

  // 家族が 1 つだけの場合は追加 read をしない (ほとんどの家庭がこのケース)
  let families: SessionContext['families'] = [
    { id: activeFamilyId, name: str(familyData.name, 'グループ'), role },
  ];
  if (profile.familyIds.length > 1) {
    const others = await db.getAll(
      ...profile.familyIds
        .filter((id) => id !== activeFamilyId)
        .map((id) => db.collection('families').doc(id)),
    );
    families = [
      ...families,
      ...others
        .filter((snap) => snap.exists)
        .map((snap) => ({
          id: snap.id,
          name: str(snap.data()?.name, 'グループ'),
          role: 'member' as Role,
        })),
    ];
  }

  return {
    userId: user.uid,
    displayName: str(memberData.displayName, profile.displayName),
    email: profile.email,
    photoUrl: strOrNull(memberData.photoUrl) ?? profile.photoUrl,
    familyId: activeFamilyId,
    familyName: str(familyData.name, 'グループ'),
    role,
    families,
  };
});

/** ページ用: 未ログインならログイン画面、家族未所属ならオンボーディングへ */
export async function requireSession(): Promise<SessionContext> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const session = await getSessionContext();
  if (!session) redirect('/onboarding');
  return session;
}

/**
 * Server Action 用: リダイレクトではなく例外を投げる。
 * さらに「クライアントから送られてきた familyId」が本人の所属家族と一致するかを
 * 必ず検証する — これが IDOR (別家族のデータを ID 指定で操作する攻撃) 対策の要。
 */
export async function requireFamilyAccess(familyId: string): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) throw unauthenticated();
  if (session.familyId !== familyId) {
    // 複数家族に所属している場合は所属していれば許可し、コンテキストを差し替える
    const belongs = session.families.some((f) => f.id === familyId);
    if (!belongs) {
      logger.warn('所属外のグループへのアクセスを拒否しました', {
        userId: session.userId,
        familyId,
        action: 'family.access_denied',
      });
      throw forbidden('このグループのデータにはアクセスできません。');
    }
    return switchFamilyContext(session, familyId);
  }
  return session;
}

async function switchFamilyContext(session: SessionContext, familyId: string): Promise<SessionContext> {
  const db = getDb();
  const [familySnap, memberSnap] = await Promise.all([
    db.collection('families').doc(familyId).get(),
    db.collection('families').doc(familyId).collection('members').doc(session.userId).get(),
  ]);
  if (!familySnap.exists || !memberSnap.exists) throw forbidden('このグループのデータにはアクセスできません。');
  const role = (memberSnap.data()?.role === 'admin' ? 'admin' : 'member') as Role;
  return {
    ...session,
    familyId,
    familyName: str(familySnap.data()?.name, 'グループ'),
    role,
  };
}

export async function requireAdminAccess(familyId: string): Promise<SessionContext> {
  const session = await requireFamilyAccess(familyId);
  if (session.role !== 'admin') {
    throw forbidden('この操作は管理者のみ実行できます。');
  }
  return session;
}

export type { Family, FamilyMember };
