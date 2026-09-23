'use client';

import { useActionState, useState } from 'react';
import { createFamilyAction, joinFamilyAction } from '@/features/family/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button } from '@/components/ui/button';
import { Field, FormError, TextInput } from '@/components/ui/field';

/**
 * オンボーディング (グループの作成 / 参加)。
 *
 * useActionState を使い、JavaScript が無効でも form の POST として
 * 動作する形にしている (Progressive Enhancement)。
 *
 * 作成時に入力してもらう項目は無い。名前はサーバー側で自動的に付けるので、
 * 「つくる」を押すだけで使いはじめられる。
 */
export function OnboardingForms() {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [createState, createAction, creating] = useActionState(createFamilyAction, emptyFormState);
  const [joinState, joinAction, joining] = useActionState(joinFamilyAction, emptyFormState);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex rounded-xl bg-surface-muted p-1 text-sm">
        {(
          [
            ['create', '新しくはじめる'],
            ['join', '招待コードで参加'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-[42px] flex-1 rounded-lg font-medium transition-colors ${
              tab === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'create' ? (
        <form action={createAction} className="flex flex-col gap-4">
          <FormError message={createState.error} />
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink-soft">
            <Point>予定・写真・経費を、招待した人だけで共有できます。</Point>
            <Point>
              作成した人は自動的に<strong className="font-semibold text-ink">管理者</strong>
              になります。
            </Point>
            <Point>管理者は招待コードの発行・メンバー管理・経費の承認ができます。</Point>
          </ul>
          <Button type="submit" size="lg" disabled={creating}>
            {creating ? '作成中…' : 'はじめる'}
          </Button>
        </form>
      ) : (
        <form action={joinAction} className="flex flex-col gap-4">
          <FormError message={joinState.error} />
          <Field
            label="招待コード"
            htmlFor="invite-code"
            required
            hint="管理者から受け取った10桁のコード"
          >
            <TextInput
              id="invite-code"
              name="inviteCode"
              required
              maxLength={12}
              placeholder="ABCD234XYZ"
              autoCapitalize="characters"
              autoComplete="off"
              className="text-center text-lg tracking-[0.2em] uppercase"
            />
          </Field>
          <Button type="submit" size="lg" disabled={joining}>
            {joining ? '参加中…' : '参加する'}
          </Button>
        </form>
      )}
    </div>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="mt-px shrink-0 text-brand">
        ・
      </span>
      <span>{children}</span>
    </li>
  );
}
