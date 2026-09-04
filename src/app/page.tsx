import { redirect } from 'next/navigation';
import { getCurrentUser, getSessionContext } from '@/lib/auth/session';

/**
 * 入口。ログイン状態と家族への所属状況で行き先を振り分ける。
 *  未ログイン        -> /login
 *  家族に未所属      -> /onboarding
 *  それ以外          -> /home
 */
export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const session = await getSessionContext();
  if (!session) redirect('/onboarding');

  redirect('/home');
}
