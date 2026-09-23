'use client';

import { useActionState, useState } from 'react';
import {
  changeMemberRoleAction,
  leaveFamilyAction,
  regenerateInviteCodeAction,
  removeMemberAction,
  switchFamilyAction,
  updateProfileAction,
} from '@/features/family/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button } from '@/components/ui/button';
import { Field, FormError, FormSuccess, TextInput } from '@/components/ui/field';
import { Avatar } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/ui/badge';
import type { FamilyMember, SessionContext } from '@/lib/types';
import { formatJstDate } from '@/lib/datetime';

/** 表示名の変更 */
export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, emptyFormState);
  return (
    <form action={action} className="flex flex-col gap-3 p-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <Field label="表示名" htmlFor="displayName">
        <TextInput
          id="displayName"
          name="displayName"
          required
          maxLength={30}
          defaultValue={displayName}
        />
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? '保存中…' : '保存する'}
      </Button>
    </form>
  );
}

/** 招待コードの表示と再発行 (admin のみ) */
export function InviteCodeCard({
  familyId,
  code,
  expiresAt,
}: {
  familyId: string;
  code: string | null;
  expiresAt: string | null;
}) {
  const [state, action, pending] = useActionState(regenerateInviteCodeAction, emptyFormState);
  const [copied, setCopied] = useState(false);
  const currentCode = state.data?.code ?? code;

  async function copy() {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {currentCode ? (
        <>
          <button
            type="button"
            onClick={copy}
            className="rounded-xl border border-dashed border-brand/50 bg-brand-soft px-4 py-4 text-center"
          >
            <span className="tabular block text-2xl font-bold tracking-[0.25em] text-brand-dark">
              {currentCode}
            </span>
            <span className="mt-1 block text-xs text-brand-dark/80">
              {copied ? 'コピーしました' : 'タップしてコピー'}
            </span>
          </button>
          {expiresAt && !state.data ? (
            <p className="text-xs text-ink-faint">
              有効期限: {formatJstDate(expiresAt)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          有効な招待コードがありません。再発行してください。
        </p>
      )}

      <form action={action}>
        <input type="hidden" name="familyId" value={familyId} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? '発行中…' : '招待コードを再発行'}
        </Button>
      </form>
      <p className="text-xs leading-relaxed text-ink-faint">
        再発行すると古いコードは使えなくなります。コードは推測されにくい10桁で、
        7日間有効です。招待したい相手以外には共有しないでください。
      </p>
    </div>
  );
}

/** メンバー一覧 (admin は権限変更と削除ができる) */
export function MemberList({
  familyId,
  members,
  session,
}: {
  familyId: string;
  members: FamilyMember[];
  session: SessionContext;
}) {
  const [roleState, roleAction, roleUpdating] = useActionState(
    changeMemberRoleAction,
    emptyFormState,
  );
  const [removeState, removeAction, removing] = useActionState(removeMemberAction, emptyFormState);
  const isAdmin = session.role === 'admin';

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3">
        <FormError message={roleState.error ?? removeState.error} />
        <FormSuccess message={roleState.success ?? removeState.success} />
      </div>

      <ul className="divide-y divide-line">
        {members.map((member) => {
          const isSelf = member.userId === session.userId;
          return (
            // 名前と参加日を潰さないよう、狭い画面では操作ボタンを次の行へ折り返す
            <li key={member.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Avatar displayName={member.displayName} photoUrl={member.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[15px] font-medium text-ink">
                  {member.displayName}
                  {isSelf ? <span className="text-xs text-ink-faint">(自分)</span> : null}
                </p>
                <p className="truncate whitespace-nowrap text-xs text-ink-faint">
                  {formatJstDate(member.joinedAt)} に参加
                </p>
              </div>

              <RoleBadge role={member.role} />

              {isAdmin && !isSelf ? (
                <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
                  <form action={roleAction}>
                    <input type="hidden" name="familyId" value={familyId} />
                    <input type="hidden" name="targetUserId" value={member.userId} />
                    <input
                      type="hidden"
                      name="role"
                      value={member.role === 'admin' ? 'member' : 'admin'}
                    />
                    <Button type="submit" variant="ghost" size="sm" disabled={roleUpdating}>
                      {member.role === 'admin' ? '一般に' : '管理者に'}
                    </Button>
                  </form>
                  <form
                    action={removeAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`${member.displayName} さんを削除しますか?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="familyId" value={familyId} />
                    <input type="hidden" name="targetUserId" value={member.userId} />
                    <Button type="submit" variant="ghost" size="sm" disabled={removing}>
                      削除
                    </Button>
                  </form>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 複数のグループに所属している場合の切り替え */
export function FamilySwitcher({ session }: { session: SessionContext }) {
  const [state, action, pending] = useActionState(switchFamilyAction, emptyFormState);
  if (session.families.length <= 1) return null;

  return (
    <div className="flex flex-col gap-2 p-4">
      <FormError message={state.error} />
      {session.families.map((family) => (
        <form key={family.id} action={action}>
          <input type="hidden" name="familyId" value={family.id} />
          <Button
            type="submit"
            variant={family.id === session.familyId ? 'primary' : 'secondary'}
            size="lg"
            disabled={pending || family.id === session.familyId}
          >
            {family.name}
            {family.id === session.familyId ? ' (表示中)' : ''}
          </Button>
        </form>
      ))}
    </div>
  );
}

/** グループから抜ける */
export function LeaveFamilyForm({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(leaveFamilyAction, emptyFormState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('このグループから抜けますか? 再参加には招待コードが必要です。')) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2 p-4"
    >
      <input type="hidden" name="familyId" value={familyId} />
      <FormError message={state.error} />
      <Button type="submit" variant="danger" size="lg" disabled={pending}>
        {pending ? '処理中…' : 'このグループから抜ける'}
      </Button>
    </form>
  );
}
