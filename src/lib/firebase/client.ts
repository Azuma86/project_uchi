'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import type { PublicRuntimeConfig } from '@/lib/firebase/client-config';

/**
 * ブラウザ側の Firebase 初期化。
 *
 * このアプリでクライアント SDK を使うのは「認証」だけ。
 * Firestore / Storage の読み書きは Server Component と Server Action を通す。
 *
 * なぜそうするのか:
 *   - Firestore の read 回数を制御しやすい (課金の予測が立つ)。
 *   - 権限判定を 1 箇所 (サーバー) に集約できる。
 *   - 初期表示が速い (クライアントで SDK をロードしてから取得しない)。
 *  それでも Firestore Security Rules は必須。ユーザーの ID トークンがあれば
 *  ブラウザから直接 Firestore API を叩けてしまうため、DB 側の防御が要る。
 */

let cachedApp: FirebaseApp | null = null;
let emulatorConnected = false;

export function getFirebaseApp(config: PublicRuntimeConfig): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config.firebase);
  return cachedApp;
}

export function getFirebaseAuth(config: PublicRuntimeConfig): Auth {
  const auth = getAuth(getFirebaseApp(config));

  if (config.emulator.enabled && !emulatorConnected) {
    emulatorConnected = true;
    connectAuthEmulator(auth, `http://${config.emulator.authHost}`, { disableWarnings: true });
  }

  // ログイン状態をタブを閉じても保持する (家族アプリなので毎回のログインは避けたい)
  void setPersistence(auth, browserLocalPersistence);
  return auth;
}
