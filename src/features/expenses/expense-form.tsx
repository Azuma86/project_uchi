'use client';

import { useActionState } from 'react';
import { createExpenseAction, updateExpenseAction } from '@/features/expenses/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, FormError, Select, TextArea, TextInput } from '@/components/ui/field';
import { ReceiptUploader } from '@/features/expenses/receipt-uploader';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_EMOJI, EXPENSE_CATEGORY_LABEL, type Expense } from '@/lib/types';
import { toDateInputValue } from '@/lib/datetime';

/**
 * 経費の作成・編集フォーム。
 *
 * 送信ボタンが 2 つある:
 *   - 下書き保存 (submit=false)  … あとで編集できる
 *   - 申請する   (submit=true)   … pending になり、以降は編集できない
 * どちらも同じ Server Action を呼び、name="submit" の値で分岐する。
 */
export function ExpenseForm({
  familyId,
  expense,
  receiptUrl,
}: {
  familyId: string;
  expense?: Expense;
  receiptUrl?: string | null;
}) {
  const isEdit = Boolean(expense);
  const [state, action, pending] = useActionState(
    isEdit ? updateExpenseAction : createExpenseAction,
    emptyFormState,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="familyId" value={familyId} />
      {expense ? <input type="hidden" name="expenseId" value={expense.id} /> : null}

      <FormError message={state.error} />

      <Field label="金額" htmlFor="amount" required>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-soft">
            ¥
          </span>
          <TextInput
            id="amount"
            name="amount"
            inputMode="numeric"
            required
            defaultValue={expense ? String(expense.amount) : ''}
            placeholder="4580"
            className="tabular pl-7 text-lg font-semibold"
          />
        </div>
      </Field>

      <Field label="購入日" htmlFor="purchaseDate" required>
        <TextInput
          id="purchaseDate"
          name="purchaseDate"
          type="date"
          required
          defaultValue={
            expense ? toDateInputValue(expense.purchaseDate) : toDateInputValue(new Date())
          }
        />
      </Field>

      <Field label="店舗名" htmlFor="merchant" required>
        <TextInput
          id="merchant"
          name="merchant"
          required
          maxLength={100}
          defaultValue={expense?.merchant}
          placeholder="例: スーパーやまだ"
        />
      </Field>

      <Field label="カテゴリ" htmlFor="category" required>
        <Select id="category" name="category" required defaultValue={expense?.category ?? 'food'}>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {EXPENSE_CATEGORY_EMOJI[category]} {EXPENSE_CATEGORY_LABEL[category]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="内容・メモ" htmlFor="description">
        <TextArea
          id="description"
          name="description"
          maxLength={1000}
          defaultValue={expense?.description ?? ''}
          placeholder="何を買ったか、なぜ必要だったか"
        />
      </Field>

      <Field label="領収書">
        <ReceiptUploader
          familyId={familyId}
          initialStoragePath={expense?.receiptStoragePath}
          initialPreviewUrl={receiptUrl}
        />
      </Field>

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" name="submit" value="true" size="lg" disabled={pending}>
          {pending ? '処理中…' : '申請する'}
        </Button>
        <Button
          type="submit"
          name="submit"
          value="false"
          variant="secondary"
          size="lg"
          disabled={pending}
        >
          下書きとして保存
        </Button>
        <ButtonLink
          href={expense ? `/expenses/${expense.id}` : '/expenses'}
          variant="ghost"
          size="lg"
        >
          キャンセル
        </ButtonLink>
      </div>

      <p className="text-center text-xs leading-relaxed text-balance text-ink-faint">
        「申請する」を押すと管理者の承認待ちになります。承認待ちの間は内容を編集できません (取り下げれば編集できます)。
      </p>
    </form>
  );
}
