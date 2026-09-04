/** クラス名を結合する小さなヘルパー (依存を増やさないため自前) */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
