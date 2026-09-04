import Link from 'next/link';

/**
 * 写真のサムネイル 1 枚。
 * src は Cloud Storage の署名付き URL (サーバー側で発行済み)。
 * next/image は使わない — 最適化サーバーを通すと Cloud Run の CPU を使うため。
 */
export function PhotoThumb({
  href,
  src,
  caption,
}: {
  href: string;
  src?: string;
  caption?: string | null;
}) {
  return (
    <Link
      href={href}
      className="relative block aspect-square overflow-hidden rounded-lg bg-surface-muted"
    >
      {src ? (
        <img
          src={src}
          alt={caption ?? ''}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.03]"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-ink-faint" aria-hidden>
          🖼
        </span>
      )}
    </Link>
  );
}
