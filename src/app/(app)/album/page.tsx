import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { listAlbums } from '@/lib/data/albums';
import { listPhotos } from '@/lib/data/photos';
import { createReadUrls } from '@/lib/storage/gcs';
import { AppHeader } from '@/components/nav/app-header';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { PhotoThumb } from '@/features/album/photo-thumb';
import { PhotoUploader } from '@/features/album/photo-uploader';
import { formatJstDate } from '@/lib/datetime';

export const metadata: Metadata = { title: 'アルバム' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

export default async function AlbumPage() {
  const session = await requireSession();

  const [albums, photos] = await Promise.all([
    listAlbums(session.familyId),
    listPhotos({ familyId: session.familyId, limit: PAGE_SIZE }),
  ]);

  // 一覧に必要な署名付き URL をまとめて発行する
  const urls = await createReadUrls({
    familyId: session.familyId,
    storagePaths: photos.map((photo) => photo.thumbnailStoragePath ?? photo.storagePath),
  });

  // 撮影日ごとにグループ化して表示する
  const groups = new Map<string, typeof photos>();
  for (const photo of photos) {
    const key = formatJstDate(photo.takenAt);
    const list = groups.get(key);
    if (list) list.push(photo);
    else groups.set(key, [photo]);
  }

  return (
    <>
      <AppHeader session={session} title="アルバム" />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="flex flex-col gap-4">
          <PhotoUploader familyId={session.familyId} albums={albums} />

          <Card>
            <CardHeader
              title="アルバム"
              action={
                <Link href="/album/new" className="text-sm font-medium text-brand">
                  + 新規作成
                </Link>
              }
            />
            {albums.length === 0 ? (
              <EmptyState
                icon="📁"
                title="アルバムはまだありません"
                description="旅行やイベントごとに写真をまとめられます"
              />
            ) : (
              <ul className="flex gap-3 overflow-x-auto px-4 py-3">
                {albums.map((album) => (
                  <li key={album.id} className="w-32 shrink-0">
                    <Link href={`/album/${album.id}`} className="block">
                      <div className="flex aspect-square items-center justify-center rounded-xl bg-surface-muted text-2xl">
                        📁
                      </div>
                      <p className="mt-1.5 truncate text-sm font-medium text-ink">{album.name}</p>
                      <p className="text-xs text-ink-faint">{album.photoCount}枚</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section>
            <h2 className="mb-2 px-1 text-[15px] font-semibold text-ink">すべての写真</h2>
            {photos.length === 0 ? (
              <Card>
                <EmptyState
                  icon="📷"
                  title="まだ写真がありません"
                  description="上のボタンから写真を追加しましょう"
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {[...groups.entries()].map(([date, items]) => (
                  <div key={date}>
                    <h3 className="mb-1.5 px-1 text-xs font-medium text-ink-faint">{date}</h3>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                      {items.map((photo) => (
                        <PhotoThumb
                          key={photo.id}
                          href={`/album/photo/${photo.id}`}
                          src={urls[photo.thumbnailStoragePath ?? photo.storagePath]}
                          caption={photo.caption}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {photos.length === PAGE_SIZE ? (
                  <p className="pb-4 text-center text-xs text-ink-faint">
                    最新 {PAGE_SIZE} 枚を表示しています。アルバムから絞り込めます。
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
