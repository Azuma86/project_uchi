import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getPhoto } from '@/lib/data/photos';
import { listAlbums } from '@/lib/data/albums';
import { listMembers } from '@/lib/data/families';
import { createReadUrl } from '@/lib/storage/gcs';
import { AppHeader } from '@/components/nav/app-header';
import { formatJstDateTime } from '@/lib/datetime';
import { formatBytes } from '@/lib/format';
import { canDeletePhoto, canEditPhoto } from '@/lib/permissions';
import { PhotoEditor } from '@/features/album/photo-editor';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: '写真' };
export const dynamic = 'force-dynamic';

export default async function PhotoDetailPage({
  params,
}: {
  params: Promise<{ photoId: string }>;
}) {
  const session = await requireSession();
  const { photoId } = await params;

  const photo = await getPhoto({ familyId: session.familyId, photoId });
  if (!photo) notFound();

  const [url, albums, members] = await Promise.all([
    // 大きい画像は詳細画面でだけ署名する (一覧ではサムネイルのみ)
    createReadUrl({ storagePath: photo.storagePath, familyId: session.familyId }),
    listAlbums(session.familyId),
    listMembers(session.familyId),
  ]);

  const uploader = members.find((member) => member.userId === photo.uploadedBy);
  const canEdit = canEditPhoto({ role: session.role, userId: session.userId, photo });
  const canDelete = canDeletePhoto({ role: session.role, userId: session.userId, photo });

  return (
    <>
      <AppHeader session={session} title="写真" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl bg-black/5">
            <img
              src={url}
              alt={photo.caption ?? ''}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>

          <dl className="flex flex-col gap-1 px-1 text-sm text-ink-soft">
            <div className="flex gap-2">
              <dt className="text-ink-faint">撮影日時</dt>
              <dd>{formatJstDateTime(photo.takenAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-faint">追加した人</dt>
              <dd>{uploader?.displayName ?? '不明'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-faint">サイズ</dt>
              <dd>
                {photo.width && photo.height ? `${photo.width}×${photo.height} / ` : ''}
                {formatBytes(photo.byteSize)}
              </dd>
            </div>
          </dl>

          {canEdit ? (
            <PhotoEditor
              familyId={session.familyId}
              photo={photo}
              albums={albums}
              canDelete={canDelete}
            />
          ) : (
            <>
              {photo.caption ? (
                <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink">
                  {photo.caption}
                </p>
              ) : null}
              <p className="text-center text-xs text-ink-faint">
                この写真は投稿者または管理者のみ編集できます
              </p>
            </>
          )}

          <ButtonLink
            href={photo.albumId ? `/album/${photo.albumId}` : '/album'}
            variant="ghost"
            size="lg"
          >
            アルバムに戻る
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
