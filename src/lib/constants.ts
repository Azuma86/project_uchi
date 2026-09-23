/**
 * アプリ全体で使う定数。
 * アプリ名を変えたい場合はここ 1 箇所を書き換えれば全画面・manifest・
 * メタデータへ反映される。
 */
export const APP_NAME = 'UCHI+';
export const APP_NAME_JA = 'ウチプラス';
export const APP_DESCRIPTION =
  'カレンダー・アルバム・経費申請をひとつにまとめたプライベートアプリ';

/**
 * 画面に出す短いキャッチコピー。
 * ログイン画面のような狭い幅でも 1 行に収まる長さ (全角 18 文字) にしてある。
 * 説明文 (APP_DESCRIPTION) は manifest とメタデータ専用。
 */
export const APP_TAGLINE = 'カレンダー・アルバム・経費をひとつに';
export const APP_SHORT_NAME = 'UCHI+';

/** 表示・入力で使うタイムゾーン。DB には常に UTC で保存する。 */
export const APP_TIME_ZONE = 'Asia/Tokyo';

/** 通貨。日本円は小数点以下を持たない。 */
export const APP_CURRENCY = 'JPY';

/** テーマカラー (PWA manifest / ブラウザ UI と揃える) */
export const APP_THEME_COLOR = '#f4f7fa';
/** ベースカラー = オーシャンブルー。globals.css の --color-brand と同じ値。 */
export const APP_BRAND_COLOR = '#0b72b5';
