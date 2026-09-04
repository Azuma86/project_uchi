'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { finalizePhotoAction } from '@/features/album/actions';
import { requestUploadTargetAction } from '@/features/uploads/actions';
import { processPhoto } from '@/lib/images/process';
import { ACCEPT_ATTRIBUTE, MAX_BATCH_UPLOAD } from '@/lib/validation/upload';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import type { Album } from '@/lib/types';

type Progress = {
  total: number;
  done: number;
  currentName: string;
};

/**
 * 写真アップロード。
 *
 * 1 枚ごとに次の流れを繰り返す:
 *   ブラウザで縮小 (WebP) → 署名付き URL を取得 → GCS へ直接 PUT → Firestore へ登録
 *
 * 直列に処理しているのは、
 *   - スマホの回線で同時アップロードすると失敗しやすい
 *   - 進捗を「n枚中m枚」と分かりやすく出せる
 * ため。家族が一度に選ぶのは数枚〜十数枚という想定。
 */
export function PhotoUploader({
  familyId,
  albumId,
  albums,
  label = '写真を追加',
}: {
  familyId: string;
  albumId?: string | null;
  albums?: Album[];
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetAlbumId, setTargetAlbumId] = useState<string>(albumId ?? '');

  async function uploadBlob(
    blob: Blob,
    contentType: string,
    kind: 'photo' | 'thumbnail',
  ): Promise<string> {
    const target = await requestUploadTargetAction({
      familyId,
      kind,
      contentType,
      byteSize: blob.size,
    });
    if (!target.ok) throw new Error(target.error);

    const response = await fetch(target.data.uploadUrl, {
      method: 'PUT',
      headers: target.data.headers,
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`アップロードに失敗しました (${response.status})。`);
    }
    return target.data.storagePath;
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, MAX_BATCH_UPLOAD);

    setError(null);
    setProgress({ total: files.length, done: 0, currentName: files[0]?.name ?? '' });

    let succeeded = 0;
    for (const [index, file] of files.entries()) {
      setProgress({ total: files.length, done: index, currentName: file.name });
      try {
        const processed = await processPhoto(file);
        const [storagePath, thumbnailStoragePath] = await Promise.all([
          uploadBlob(processed.full.blob, processed.full.contentType, 'photo'),
          uploadBlob(processed.thumbnail.blob, processed.thumbnail.contentType, 'thumbnail'),
        ]);

        const result = await finalizePhotoAction({
          familyId,
          albumId: targetAlbumId || null,
          storagePath,
          thumbnailStoragePath,
          caption: '',
          takenAt: processed.takenAt.toISOString(),
          width: processed.full.width,
          height: processed.full.height,
        });
        if (!result.ok) throw new Error(result.error);
        succeeded += 1;
      } catch (err) {
        setError(
          `${file.name} のアップロードに失敗しました: ${
            err instanceof Error ? err.message : '不明なエラー'
          }`,
        );
        break;
      }
    }

    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
    if (succeeded > 0) router.refresh();
  }

  const busy = progress !== null;

  return (
    <div className="flex flex-col gap-3">
      {albums && albums.length > 0 && !albumId ? (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          追加先
          <select
            value={targetAlbumId}
            onChange={(e) => setTargetAlbumId(e.target.value)}
            disabled={busy}
            className="min-h-[40px] flex-1 rounded-lg border border-line bg-surface px-2 text-[15px] text-ink"
          >
            <option value="">未分類</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy} size="lg">
        {busy ? `アップロード中… (${progress.done + 1}/${progress.total})` : `📷 ${label}`}
      </Button>

      {busy ? (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="truncate text-xs text-ink-faint">{progress.currentName} を処理しています…</p>
        </div>
      ) : (
        <p className="text-xs text-ink-faint">
          端末内で自動的に圧縮してから保存します (最大 {MAX_BATCH_UPLOAD} 枚)。
          位置情報などの EXIF は削除されます。
        </p>
      )}

      <FormError message={error} />
    </div>
  );
}
