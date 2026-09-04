import 'server-only';
import { getEmulatorConfig, getFirebaseClientConfig, type EmulatorConfig, type FirebaseClientConfig } from '@/lib/env';

export type PublicRuntimeConfig = {
  firebase: FirebaseClientConfig;
  emulator: EmulatorConfig;
};

/**
 * ブラウザへ渡す「公開してよい設定」。
 *
 * Firebase の apiKey は秘密情報ではない (どのプロジェクトかを示す識別子)。
 * 実際のアクセス制御は Firebase Authentication と Security Rules が行う。
 * ただし Google Cloud Console 側で API キーに
 * 「HTTP リファラー制限」をかけておくのが望ましい (README 参照)。
 *
 * この値をビルド時ではなく実行時に読むことで、同じ Docker イメージを
 * dev / staging / prod へ昇格させられる。
 */
export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  return {
    firebase: getFirebaseClientConfig(),
    emulator: getEmulatorConfig(),
  };
}
