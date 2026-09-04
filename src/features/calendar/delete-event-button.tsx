'use client';

import { useActionState } from 'react';
import { deleteEventAction } from '@/features/calendar/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';

export function DeleteEventButton({ familyId, eventId }: { familyId: string; eventId: string }) {
  const [state, action, pending] = useActionState(deleteEventAction, emptyFormState);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // 誤操作防止。サーバー側でも権限を検証しているので、ここは UX のための確認。
        if (!window.confirm('この予定を削除しますか?')) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="eventId" value={eventId} />
      <FormError message={state.error} />
      <Button type="submit" variant="danger" size="lg" disabled={pending}>
        {pending ? '削除中…' : '予定を削除'}
      </Button>
    </form>
  );
}
