import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getAlbum } from '@/lib/data/albums';
import { listPhotos } from '@/lib/data/photos';
import { createReadUrls } from '@/lib/storage/gcs';
import { AppHeader } from '@/components/nav/app-header';
import { Card, EmptyState } from '@/components/ui/card';
import { PhotoThumb } from '@/features/album/photo-thumb';
import { PhotoUploader } from '@/features/album/photo-uploader';
import { DeleteAlbumButton } from '@/features/album/delete-album-button';
import { canDeleteAlbum } from '@/lib/permissions';

export const metadata: Metadata = { title: 'アルバム' };
export const dynamic = 'force-dynamic';

export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumId: string }>;
}) {
  const session = await requireSession();
  const { albumId } = await params;

  const album = await getAlbum({ familyId: session.familyId, albumId });
  if (!album) notFound();

  const photos = await listPhotos({ familyId: session.familyId, albumId, limit: 120 });
  const urls = await createReadUrls({
    familyId: session.familyId,
    storagePaths: photos.map((photo) => photo.thumbnailStoragePath ?? photo.storagePath),
  });

  const canDelete = canDeleteAlbum({ role: session.role, userId: session.userId, album });

  return (
    <>
      <AppHeader session={session} title={album.name} />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex flex-col gap-4">
          {album.description ? (
            <p className="px-1 text-sm text-ink-soft">{album.description}</p>
          ) : null}

          <PhotoUploader familyId={session.familyId} albumId={album.id} label="このアルバムに追加" />

          {photos.length === 0 ? (
            <Card>
              <EmptyState icon="📷" title="このアルバムにはまだ写真がありません" />
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
              {photos.map((photo) => (
                <PhotoThumb
                  key={photo.id}
                  href={`/album/photo/${photo.id}`}
                  src={urls[photo.thumbnailStoragePath ?? photo.storagePath]}
                  caption={photo.caption}
                />
              ))}
            </div>
          )}

          {canDelete ? (
            <div className="pt-2">
              <DeleteAlbumButton familyId={session.familyId} albumId={album.id} />
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
