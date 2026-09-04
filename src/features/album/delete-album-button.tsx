'use client';

import { useActionState } from 'react';
import { deleteAlbumAction } from '@/features/album/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';

export function DeleteAlbumButton({ familyId, albumId }: { familyId: string; albumId: string }) {
  const [state, action, pending] = useActionState(deleteAlbumAction, emptyFormState);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('このアルバムを削除しますか?')) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="albumId" value={albumId} />
      <FormError message={state.error} />
      <Button type="submit" variant="danger" size="lg" disabled={pending}>
        {pending ? '削除中…' : 'アルバムを削除'}
      </Button>
      <p className="text-center text-xs text-ink-faint">
        写真が残っている場合は削除できません
      </p>
    </form>
  );
}
