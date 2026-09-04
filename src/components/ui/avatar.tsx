import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

/** 名前から安定した色を選ぶ (同じ人はいつも同じ色) */
const TONES = [
  'bg-brand-soft text-brand-dark',
  'bg-accent-soft text-accent',
  'bg-info-soft text-info',
  'bg-warn-soft text-warn',
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return TONES[hash % TONES.length]!;
}

export function Avatar({
  displayName,
  photoUrl,
  size = 'md',
  className,
}: {
  displayName: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        SIZES[size],
        toneFor(displayName),
        className,
      )}
    >
      {initials(displayName)}
    </span>
  );
}
