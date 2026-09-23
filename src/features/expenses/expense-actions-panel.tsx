'use client';

import { useActionState, useState } from 'react';
import {
  deleteExpenseAction,
  reviewExpenseAction,
  submitExpenseAction,
  withdrawExpenseAction,
} from '@/features/expenses/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button, ButtonLink } from '@/components/ui/button';
import { FormError, FormSuccess, TextArea } from '@/components/ui/field';
import type { ExpenseStatus } from '@/lib/types';

/**
 * 経費詳細の操作ボタン群。
 *
 * 表示の出し分けはサーバーから渡された can* フラグに従うが、
 * 実際の可否は Server Action 側で必ず再判定される。
 * (ここを DevTools で書き換えても操作は通らない)
 */
export function ExpenseActionsPanel({
  familyId,
  expenseId,
  status,
  canSubmit,
  canWithdraw,
  canEdit,
  canDelete,
  canReview,
}: {
  familyId: string;
  expenseId: string;
  status: ExpenseStatus;
  canSubmit: boolean;
  canWithdraw: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReview: boolean;
}) {
  const [submitState, submitAction, submitting] = useActionState(
    submitExpenseAction,
    emptyFormState,
  );
  const [withdrawState, withdrawAction, withdrawing] = useActionState(
    withdrawExpenseAction,
    emptyFormState,
  );
  const [reviewState, reviewAction, reviewing] = useActionState(
    reviewExpenseAction,
    emptyFormState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteExpenseAction,
    emptyFormState,
  );
  const [comment, setComment] = useState('');

  const isApproved = status === 'approved';
  const confirmMessage = isApproved
    ? 'この承認済みの経費を削除しますか?\n今月の承認済み合計からも取り除かれます。'
    : 'この経費を削除しますか?';

  return (
    <div className="flex flex-col gap-4">
      {canReview ? (
        <form action={reviewAction} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="expenseId" value={expenseId} />

          <h3 className="text-[15px] font-semibold text-ink">承認 / 却下</h3>
          <FormError message={reviewState.error} />
          <FormSuccess message={reviewState.success} />

          <TextArea
            name="adminComment"
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="コメント (任意)。却下の場合は理由を書くと親切です。"
          />

          <div className="flex gap-2">
            <Button
              type="submit"
              name="decision"
              value="approved"
              className="flex-1"
              disabled={reviewing}
            >
              {reviewing ? '処理中…' : '承認する'}
            </Button>
            <Button
              type="submit"
              name="decision"
              value="rejected"
              variant="danger"
              className="flex-1"
              disabled={reviewing}
            >
              却下する
            </Button>
          </div>
        </form>
      ) : null}

      {canSubmit ? (
        <form action={submitAction} className="flex flex-col gap-2">
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="expenseId" value={expenseId} />
          <FormError message={submitState.error} />
          <FormSuccess message={submitState.success} />
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? '申請中…' : '申請する'}
          </Button>
        </form>
      ) : null}

      {canEdit ? (
        <ButtonLink href={`/expenses/${expenseId}/edit`} variant="secondary" size="lg">
          編集する
        </ButtonLink>
      ) : null}

      {canWithdraw ? (
        <form action={withdrawAction} className="flex flex-col gap-2">
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="expenseId" value={expenseId} />
          <FormError message={withdrawState.error} />
          <FormSuccess message={withdrawState.success} />
          <Button type="submit" variant="secondary" size="lg" disabled={withdrawing}>
            {withdrawing ? '取り下げ中…' : '申請を取り下げる'}
          </Button>
        </form>
      ) : null}

      {canDelete ? (
        <form
          action={deleteAction}
          onSubmit={(event) => {
            // 承認済みは集計に入っているので、消える影響を明示してから確認する
            if (!window.confirm(confirmMessage)) event.preventDefault();
          }}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="expenseId" value={expenseId} />
          <FormError message={deleteState.error} />
          <Button type="submit" variant="danger" size="lg" disabled={deleting}>
            {deleting ? '削除中…' : '削除する'}
          </Button>
          {isApproved ? (
            <p className="text-center text-xs leading-relaxed text-balance text-ink-faint">
              削除すると承認済みの集計からも取り除かれます。元には戻せません。
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
