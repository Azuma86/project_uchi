/** アプリのシンボルマーク (家 + プラス)。public/icons のアイコンと同じ形。 */
export function AppMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="UCHI+"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="16" fill="#e07a5f" />
      <path
        d="M32 16 L51 32 H45.5 V48 H35.5 V39 H28.5 V48 H18.5 V32 H13 Z"
        fill="#fff"
      />
      <path
        d="M46.2 11.5 h3.6 v3.7 h3.7 v3.6 h-3.7 v3.7 h-3.6 v-3.7 h-3.7 v-3.6 h3.7 Z"
        fill="#fff"
      />
    </svg>
  );
}
