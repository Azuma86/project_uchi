import { getPublicRuntimeConfig } from '@/lib/firebase/client-config';
import { RuntimeConfigProvider } from '@/components/providers/firebase-provider';

export const dynamic = 'force-dynamic';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <RuntimeConfigProvider config={getPublicRuntimeConfig()}>{children}</RuntimeConfigProvider>;
}
