'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useRuntimeConfig } from '@/components/providers/firebase-provider';
import { Button } from '@/components/ui/button';

/**
 * ログアウト。
 * 1. サーバー側のセッション Cookie を破棄
 * 2. ブラウザ側の Firebase の状態も破棄 (残っていると自動再ログインされる)
 */
export function SignOutButton({
  variant = 'secondary',
  size = 'md',
}: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  const config = useRuntimeConfig();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      await signOut(getFirebaseAuth(config)).catch(() => undefined);
      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={handleSignOut} disabled={busy}>
      {busy ? 'ログアウト中…' : 'ログアウト'}
    </Button>
  );
}
