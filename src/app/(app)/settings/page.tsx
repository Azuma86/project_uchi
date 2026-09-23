import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { getActiveInviteCode, listMembers } from '@/lib/data/families';
import { AppHeader } from '@/components/nav/app-header';
import { Card, CardHeader } from '@/components/ui/card';
import { SignOutButton } from '@/features/auth/sign-out-button';
import {
  FamilySwitcher,
  InviteCodeCard,
  LeaveFamilyForm,
  MemberList,
  ProfileForm,
} from '@/features/family/settings-forms';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

export const metadata: Metadata = { title: '設定' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();

  // 招待コードは管理者だけが取得する (member には見せない)
  const [members, inviteCode] = await Promise.all([
    listMembers(session.familyId),
    session.role === 'admin' ? getActiveInviteCode(session.familyId) : Promise.resolve(null),
  ]);

  return (
    <>
      <AppHeader session={session} title="設定" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="flex flex-col gap-4 pb-6">
          <Card>
            <CardHeader title="プロフィール" />
            <ProfileForm displayName={session.displayName} />
          </Card>

          <Card>
            <CardHeader
              title="メンバー"
              action={<span className="text-sm text-ink-faint">{members.length}人</span>}
            />
            <MemberList familyId={session.familyId} members={members} session={session} />
            {session.role !== 'admin' ? (
              <p className="px-4 pb-4 text-xs text-ink-faint">
                メンバーの追加・削除・権限変更は管理者のみ行えます。
              </p>
            ) : null}
          </Card>

          {session.role === 'admin' ? (
            <Card>
              <CardHeader title="招待コード" />
              <InviteCodeCard
                familyId={session.familyId}
                code={inviteCode?.code ?? null}
                expiresAt={inviteCode?.expiresAt ?? null}
              />
            </Card>
          ) : null}

          {session.families.length > 1 ? (
            <Card>
              <CardHeader title="グループの切り替え" />
              <FamilySwitcher session={session} />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="アカウント" />
            <div className="flex flex-col gap-2 p-4">
              <p className="text-sm text-ink-soft">{session.email ?? 'メールアドレス未設定'}</p>
              <SignOutButton size="lg" />
            </div>
            <LeaveFamilyForm familyId={session.familyId} />
          </Card>

          <p className="text-center text-xs text-ink-faint">
            {APP_NAME} — {APP_TAGLINE}
          </p>
        </div>
      </main>
    </>
  );
}
