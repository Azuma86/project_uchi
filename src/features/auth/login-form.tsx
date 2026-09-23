'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  updateProfile,
  type User,
} from 'firebase/auth';
import { useRuntimeConfig } from '@/components/providers/firebase-provider';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Field, FormError, FormSuccess, TextInput } from '@/components/ui/field';
import { signInSchema, signUpSchema } from '@/lib/validation/schemas';

type Mode = 'signin' | 'signup' | 'magic';

const EMAIL_STORAGE_KEY = 'uchi-plus:magic-link-email';

/**
 * ログイン画面。
 *
 * 流れ:
 *   1. ブラウザの Firebase SDK でログインする (パスワード / Google / メールリンク)
 *   2. 取得した ID トークンを /api/auth/session へ送る
 *   3. サーバーが検証してセッション Cookie (HttpOnly) を発行する
 *   4. 以降の画面表示はサーバー側で Cookie を見て判定する
 *
 * ID トークンを localStorage に保存しないのがポイント (XSS 対策)。
 */
export function LoginForm() {
  const config = useRuntimeConfig();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // メールリンク経由で戻ってきた場合の処理
  useEffect(() => {
    const auth = getFirebaseAuth(config);
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const savedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    const target = savedEmail ?? window.prompt('確認のためメールアドレスを入力してください') ?? '';
    if (!target) return;

    // メールリンクからの復帰は「外部システム (URL) との同期」なので
    // マウント時の effect で処理する。ここでの setState は初回 1 回きり。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    signInWithEmailLink(auth, target, window.location.href)
      .then(async (credential) => {
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        await establishSession(credential.user);
      })
      .catch((err: unknown) => setError(toMessage(err)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function establishSession(user: User) {
    const idToken = await user.getIdToken(true);
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'ログインに失敗しました。');
    }
    // Server Component を最新の状態で描き直す
    router.replace('/');
    router.refresh();
  }

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const auth = getFirebaseAuth(config);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const parsed = signUpSchema.safeParse({ displayName, email, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? '入力内容を確認してください。');
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
        await updateProfile(credential.user, { displayName: parsed.data.displayName });
        await establishSession(credential.user);
      } else {
        const parsed = signInSchema.safeParse({ email, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? '入力内容を確認してください。');
          return;
        }
        const credential = await signInWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
        await establishSession(credential.user);
      }
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth(config);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      await establishSession(credential.user);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth(config);
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
      setNotice('ログイン用のリンクをメールで送りました。メールを開いてください。');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex rounded-xl bg-surface-muted p-1 text-sm">
        {(
          [
            ['signin', 'ログイン'],
            ['signup', '新規登録'],
            ['magic', 'メールリンク'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
              setNotice(null);
            }}
            className={`min-h-[40px] flex-1 rounded-lg font-medium transition-colors ${
              mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <FormError message={error} />
      <FormSuccess message={notice} />

      {mode === 'magic' ? (
        <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
          <Field label="メールアドレス" htmlFor="magic-email" required>
            <TextInput
              id="magic-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <p className="text-xs text-ink-faint">
            パスワード不要で、メールに届いたリンクからログインできます。
          </p>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? '送信中…' : 'ログインリンクを送る'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          {mode === 'signup' ? (
            <Field label="表示名" htmlFor="displayName" required hint="ほかのメンバーに表示される名前です">
              <TextInput
                id="displayName"
                autoComplete="name"
                required
                maxLength={30}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ゆうき"
              />
            </Field>
          ) : null}

          <Field label="メールアドレス" htmlFor="email" required>
            <TextInput
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="パスワード"
            htmlFor="password"
            required
            hint={mode === 'signup' ? '8文字以上' : undefined}
          >
            <TextInput
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" size="lg" disabled={busy}>
            {busy ? '処理中…' : mode === 'signup' ? '登録してはじめる' : 'ログイン'}
          </Button>
        </form>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        または
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button type="button" variant="secondary" size="lg" onClick={handleGoogle} disabled={busy}>
        <GoogleMark />
        Googleでログイン
      </Button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.6.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1C6.3 6.8 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}

/** Firebase のエラーコードを日本語のメッセージに変換する */
function toMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'メールアドレスまたはパスワードが正しくありません。';
    case 'auth/email-already-in-use':
      return 'このメールアドレスはすでに登録されています。ログインをお試しください。';
    case 'auth/weak-password':
      return 'パスワードは8文字以上にしてください。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらくしてからお試しください。';
    case 'auth/popup-closed-by-user':
      return 'ログインがキャンセルされました。';
    case 'auth/unauthorized-domain':
      return 'このドメインは Firebase Authentication で許可されていません (承認済みドメインに追加してください)。';
    case 'auth/operation-not-allowed':
      return 'このログイン方法は Firebase コンソールで有効化されていません。';
    default:
      if (error instanceof Error && error.message) return error.message;
      return 'ログインに失敗しました。もう一度お試しください。';
  }
}
