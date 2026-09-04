'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PublicRuntimeConfig } from '@/lib/firebase/client-config';

/**
 * サーバーから渡された「公開してよい設定」をクライアント全体で共有する。
 *
 * NEXT_PUBLIC_* を使わずこの形にしている理由:
 *   NEXT_PUBLIC_* はビルド時に JS へ焼き込まれるため、環境ごとに
 *   Docker イメージを作り直す必要が出る。実行時に渡せば
 *   「同じイメージを dev -> staging -> prod へ昇格」できる。
 */
const RuntimeConfigContext = createContext<PublicRuntimeConfig | null>(null);

export function RuntimeConfigProvider({
  config,
  children,
}: {
  config: PublicRuntimeConfig;
  children: ReactNode;
}) {
  const value = useMemo(() => config, [config]);
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig(): PublicRuntimeConfig {
  const config = useContext(RuntimeConfigContext);
  if (!config) {
    throw new Error('RuntimeConfigProvider の内側で使用してください。');
  }
  return config;
}
