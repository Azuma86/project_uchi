/**
 * アプリ全体で使う定数。
 * アプリ名を変えたい場合はここ 1 箇所を書き換えれば全画面・manifest・
 * メタデータへ反映される。
 */
export const APP_NAME = 'UCHI+';
export const APP_NAME_JA = 'ウチプラス';
export const APP_DESCRIPTION = '家族のカレンダー・アルバム・経費申請をひとつにまとめるプライベートアプリ';
export const APP_SHORT_NAME = 'UCHI+';

/** 表示・入力で使うタイムゾーン。DB には常に UTC で保存する。 */
export const APP_TIME_ZONE = 'Asia/Tokyo';

/** 通貨。日本円は小数点以下を持たない。 */
export const APP_CURRENCY = 'JPY';

/** テーマカラー (PWA manifest / ブラウザ UI と揃える) */
export const APP_THEME_COLOR = '#f8f7f4';
export const APP_BRAND_COLOR = '#e07a5f';
