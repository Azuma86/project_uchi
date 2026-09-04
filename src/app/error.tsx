'use client';

import { useEffect } from 'react';

/**
 * 予期しないエラーの表示。
 * エラーの内容はユーザーに見せず (内部構造が漏れるため)、
 * 詳細はサーバー側の Cloud Logging に記録されている。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest はサーバーのログと突き合わせるための ID
    console.error('unexpected error', error.digest);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-4xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="text-lg font-bold text-ink">問題が発生しました</h1>
      <p className="text-sm text-ink-soft">
        時間をおいて再度お試しください。
        {error.digest ? (
          <>
            <br />
            <span className="text-xs text-ink-faint">エラーID: {error.digest}</span>
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-5 font-medium text-white"
      >
        再試行する
      </button>
    </main>
  );
}
