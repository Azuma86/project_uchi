'use client';

import { useActionState } from 'react';
import { deletePhotoAction, updatePhotoAction } from '@/features/album/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button } from '@/components/ui/button';
import { Field, FormError, FormSuccess, Select, TextInput } from '@/components/ui/field';
import type { Album, Photo } from '@/lib/types';

/** キャプション編集・アルバム移動・削除 */
export function PhotoEditor({
  familyId,
  photo,
  albums,
  canDelete,
}: {
  familyId: string;
  photo: Photo;
  albums: Album[];
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState(updatePhotoAction, emptyFormState);
  const [deleteState, deleteAction, deleting] = useActionState(deletePhotoAction, emptyFormState);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <input type="hidden" name="familyId" value={familyId} />
        <input type="hidden" name="photoId" value={photo.id} />

        <FormError message={state.error} />
        <FormSuccess message={state.success} />

        <Field label="キャプション" htmlFor="caption">
          <TextInput
            id="caption"
            name="caption"
            maxLength={300}
            defaultValue={photo.caption ?? ''}
            placeholder="ひとこと"
          />
        </Field>

        <Field label="アルバム" htmlFor="albumId">
          <Select id="albumId" name="albumId" defaultValue={photo.albumId ?? ''}>
            <option value="">未分類</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存する'}
        </Button>
      </form>

      {canDelete ? (
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm('この写真を削除しますか? 元に戻せません。')) event.preventDefault();
          }}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="photoId" value={photo.id} />
          <FormError message={deleteState.error} />
          <Button type="submit" variant="danger" size="lg" disabled={deleting}>
            {deleting ? '削除中…' : '写真を削除'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
