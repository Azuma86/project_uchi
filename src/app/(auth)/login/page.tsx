import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/features/auth/login-form';
import { getCurrentUser } from '@/lib/auth/session';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
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
          {/*
            キャッチコピーは必ず 1 行に収める。
            折り返すと見た目が崩れるので、狭い画面では文字を少しだけ詰める。
          */}
          <p className="mt-1 whitespace-nowrap text-[clamp(12px,3.6vw,14px)] text-ink-soft">
            {APP_TAGLINE}
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <LoginForm />
      </div>

      {/* text-balance で行長をそろえる (手動の <br> だと幅によって端数が出る) */}
      <p className="text-center text-xs leading-relaxed text-balance text-ink-faint">
        招待された人だけが使えるプライベートアプリです。ログイン後、グループをつくるか招待コードで参加してください。
      </p>
    </main>
  );
}
