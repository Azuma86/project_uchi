'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SessionContext as Session } from '@/lib/types';

/**
 * ログイン中のユーザーと家族の情報をクライアント側で参照するための Context。
 *
 * 注意: ここに入っている role は「表示の出し分け」にのみ使う。
 * 実際の権限判定は必ずサーバー側 (Server Action) で行う。
 * クライアントの値は開発者ツールで書き換えられるため信用できない。
 */
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const value = useContext(Ctx);
  if (!value) throw new Error('SessionProvider の内側で使用してください。');
  return value;
}
