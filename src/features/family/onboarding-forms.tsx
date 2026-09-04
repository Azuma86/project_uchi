'use client';

import { useActionState, useState } from 'react';
import { createFamilyAction, joinFamilyAction } from '@/features/family/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button } from '@/components/ui/button';
import { Field, FormError, TextInput } from '@/components/ui/field';

/**
 * オンボーディング (家族の作成 / 参加)。
 *
 * useActionState を使い、JavaScript が無効でも form の POST として
 * 動作する形にしている (Progressive Enhancement)。
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
            ['create', '家族をつくる'],
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
          <Field
            label="家族の名前"
            htmlFor="family-name"
            required
            hint="例: 山田家 / さとう家"
          >
            <TextInput
              id="family-name"
              name="name"
              required
              maxLength={50}
              placeholder="山田家"
              autoComplete="off"
            />
          </Field>
          <p className="text-xs leading-relaxed text-ink-faint">
            作成した人は自動的に<strong className="text-ink-soft">管理者</strong>になります。
            管理者は招待コードの発行・メンバー管理・経費の承認ができます。
          </p>
          <Button type="submit" size="lg" disabled={creating}>
            {creating ? '作成中…' : '家族をつくる'}
          </Button>
        </form>
      ) : (
        <form action={joinAction} className="flex flex-col gap-4">
          <FormError message={joinState.error} />
          <Field
            label="招待コード"
            htmlFor="invite-code"
            required
            hint="家族の管理者から受け取った10桁のコード"
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
            {joining ? '参加中…' : '家族に参加する'}
          </Button>
        </form>
      )}
    </div>
  );
}
