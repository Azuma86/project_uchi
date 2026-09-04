import { getPublicRuntimeConfig } from '@/lib/firebase/client-config';
import { RuntimeConfigProvider } from '@/components/providers/firebase-provider';

/** ログイン画面ではブラウザ側の Firebase SDK を使うため、実行時に設定を渡す */
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <RuntimeConfigProvider config={getPublicRuntimeConfig()}>{children}</RuntimeConfigProvider>;
}
