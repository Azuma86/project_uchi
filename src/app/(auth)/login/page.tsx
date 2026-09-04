import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/features/auth/login-form';
import { getCurrentUser } from '@/lib/auth/session';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants';
import { AppMark } from '@/components/ui/app-mark';

export const metadata: Metadata = { title: 'ログイン' };

// Cookie を読むのでリクエストごとに描画する
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <AppMark size={64} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-ink-soft">{APP_DESCRIPTION}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <LoginForm />
      </div>

      <p className="text-center text-xs leading-relaxed text-ink-faint">
        このアプリは家族専用です。
        <br />
        ログイン後、家族を作成するか招待コードで参加してください。
      </p>
    </main>
  );
}
