'use client';

import { useRef, useState } from 'react';
import { requestUploadTargetAction } from '@/features/uploads/actions';
import { processReceipt } from '@/lib/images/process';
import { ACCEPT_ATTRIBUTE } from '@/lib/validation/upload';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';

/**
 * 領収書のアップロード。
 *
 * 写真と同じく「ブラウザで圧縮 → 署名付き URL で GCS へ直接 PUT」。
 * アップロード後の storagePath を hidden input に入れてフォームと一緒に送る。
 * サーバー側では、そのパスが本当に自分の家族のもので、
 * 実際にオブジェクトが存在するかを再検証する。
 */
export function ReceiptUploader({
  familyId,
  initialStoragePath,
  initialPreviewUrl,
}: {
  familyId: string;
  initialStoragePath?: string | null;
  initialPreviewUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [storagePath, setStoragePath] = useState(initialStoragePath ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const processed = await processReceipt(file);

      const target = await requestUploadTargetAction({
        familyId,
        kind: 'receipt',
        contentType: processed.contentType,
        byteSize: processed.blob.size,
      });
      if (!target.ok) throw new Error(target.error);

      const response = await fetch(target.data.uploadUrl, {
        method: 'PUT',
        headers: target.data.headers,
        body: processed.blob,
      });
      if (!response.ok) throw new Error(`アップロードに失敗しました (${response.status})。`);

      setStoragePath(target.data.storagePath);
      setPreviewUrl(URL.createObjectURL(processed.blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました。');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="receiptStoragePath" value={storagePath} />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {previewUrl ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <img src={previewUrl} alt="領収書のプレビュー" className="max-h-64 w-full object-contain" />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-1"
        >
          {busy ? 'アップロード中…' : previewUrl ? '📷 撮り直す' : '📷 領収書を撮影 / 選択'}
        </Button>
        {storagePath ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStoragePath('');
              setPreviewUrl(null);
            }}
            disabled={busy}
          >
            削除
          </Button>
        ) : null}
      </div>

      <FormError message={error} />
      <p className="text-xs text-ink-faint">
        端末内で圧縮してから保存します。領収書は申請者本人と管理者だけが閲覧できます。
      </p>
    </div>
  );
}
