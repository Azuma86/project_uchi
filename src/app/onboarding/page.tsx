import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, getSessionContext } from '@/lib/auth/session';
import { OnboardingForms } from '@/features/family/onboarding-forms';
import { AppMark } from '@/components/ui/app-mark';
import { SignOutButton } from '@/features/auth/sign-out-button';

export const metadata: Metadata = { title: 'はじめる' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const session = await getSessionContext();
  if (session) redirect('/home');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <AppMark size={56} />
        <div>
          <h1 className="text-xl font-bold text-ink">家族の設定をしましょう</h1>
          <p className="mt-1 text-sm text-ink-soft">
            新しく家族をつくるか、招待コードで参加してください。
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <OnboardingForms />
      </div>

      <div className="text-center">
        <SignOutButton variant="ghost" size="sm" />
      </div>
    </main>
  );
}
