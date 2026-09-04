import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { AppHeader } from '@/components/nav/app-header';
import { AlbumForm } from '@/features/album/album-form';

export const metadata: Metadata = { title: 'アルバムを作成' };
export const dynamic = 'force-dynamic';

export default async function NewAlbumPage() {
  const session = await requireSession();
  return (
    <>
      <AppHeader session={session} title="アルバムを作成" />
      <main className="mx-auto w-full max-w-xl px-4 py-4">
        <AlbumForm familyId={session.familyId} />
      </main>
    </>
  );
}
