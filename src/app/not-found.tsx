import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-4xl" aria-hidden>
        🔍
      </p>
      <h1 className="text-lg font-bold text-ink">ページが見つかりません</h1>
      <p className="text-sm text-ink-soft">
        URL が変わったか、アクセス権のないデータを開こうとした可能性があります。
      </p>
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-5 font-medium text-white"
      >
        ホームへ戻る
      </Link>
    </main>
  );
}
