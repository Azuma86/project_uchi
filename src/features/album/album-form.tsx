'use client';

import { useActionState } from 'react';
import { createAlbumAction, updateAlbumAction } from '@/features/album/actions';
import { emptyFormState } from '@/lib/form-state';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, FormError, FormSuccess, TextArea, TextInput } from '@/components/ui/field';
import type { Album } from '@/lib/types';

export function AlbumForm({ familyId, album }: { familyId: string; album?: Album }) {
  const isEdit = Boolean(album);
  const [state, action, pending] = useActionState(
    isEdit ? updateAlbumAction : createAlbumAction,
    emptyFormState,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="familyId" value={familyId} />
      {album ? <input type="hidden" name="albumId" value={album.id} /> : null}

      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <Field label="アルバム名" htmlFor="album-name" required>
        <TextInput
          id="album-name"
          name="name"
          required
          maxLength={50}
          defaultValue={album?.name}
          placeholder="例: 2026年 夏休み"
        />
      </Field>

      <Field label="説明" htmlFor="album-description">
        <TextArea
          id="album-description"
          name="description"
          maxLength={500}
          defaultValue={album?.description ?? ''}
          placeholder="どんな写真をまとめるか"
        />
      </Field>

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? '保存中…' : isEdit ? '変更を保存' : 'アルバムを作成'}
        </Button>
        <ButtonLink href={album ? `/album/${album.id}` : '/album'} variant="ghost" size="lg">
          キャンセル
        </ButtonLink>
      </div>
    </form>
  );
}
