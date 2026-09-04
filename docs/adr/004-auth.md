# ADR 004: なぜ Firebase Authentication を使用するか

- ステータス: 採用
- 日付: 2026-09-04

## 状況

家族だけが使えるアプリなので、確実な本人確認が必要です。

- スマホからも PC からも使う
- できればパスワードを覚えなくてよい方法も用意したい (Google ログイン)
- 将来 LINE ログインを足したい
- 認証は自作したくない (自作すると必ず穴が空く)

## 決定

**Firebase Authentication** を使い、以下に対応します。

- メールアドレス + パスワード
- Google ログイン
- メールリンク (Magic Link) — パスワード不要

ログイン後、**Firebase UID をアプリ内部のユーザー ID** として使います。

## なぜ認証を自作しないのか

パスワード認証を「正しく」作るには、少なくとも以下が必要です。

- パスワードのハッシュ化 (bcrypt / scrypt / Argon2 の適切なパラメータ)
- 総当たり攻撃へのレート制限
- パスワードリセットのトークン管理 (有効期限・使い捨て・タイミング攻撃対策)
- メールアドレス確認
- セッションの失効管理
- 漏洩済みパスワードのチェック

これらを家族アプリのために自作するのは、労力に見合わず、
かつ **間違えたときの被害が大きい** 領域です。
Firebase Authentication は無料枠 (月 5 万認証) で全部やってくれます。

## 検討した選択肢

| 選択肢 | 判断 |
|--------|------|
| **Firebase Authentication** | 採用。Firestore Security Rules で `request.auth.uid` がそのまま使えるのが決め手 |
| Identity Platform | Firebase Auth の上位版。SAML/OIDC や多要素認証が必要になったら移行できる (実体は同じサービス) |
| Auth0 / Clerk | 高機能だが、家族アプリには過剰で、無料枠を超えると有料 |
| 自作 (NextAuth + DB) | 認証ロジックの責任を全部背負うことになる。避けたい |

## セッションの持ち方

ブラウザの Firebase SDK が返す **ID トークン** を、
サーバーで検証して **セッション Cookie** に交換しています。

```
ブラウザ                          Cloud Run (Next.js)
──────                          ───────────────────
Firebase SDK でログイン
  ↓ idToken を取得
POST /api/auth/session ─────────▶ Admin SDK が idToken を検証
                                  createSessionCookie() で Cookie 発行
  ◀───── Set-Cookie: __session (HttpOnly, Secure, SameSite=Lax)
```

**なぜ ID トークンを直接使わないのか**

| 理由 | 説明 |
|------|------|
| 有効期限 | ID トークンは 1 時間で失効する。Server Component から毎回更新させるのは煩雑 |
| XSS 耐性 | `localStorage` に置くと JavaScript から読める = XSS で盗まれる。HttpOnly Cookie なら読めない |
| 失効させられる | セッション Cookie は `revokeRefreshTokens` でサーバー側から無効化できる |
| Server Component | Cookie ならサーバー側のレンダリング時にそのまま読める |

**CSRF 対策**

- Cookie に `SameSite=Lax` を付け、他サイトからの POST に Cookie が乗らないようにしています
- Server Actions は Next.js が Origin ヘッダを検証します
- `/api/auth/session` は Origin を明示的に検証しています

## LINE ログインを将来足せるようにする

LINE は Firebase Authentication の標準プロバイダではないため、
**カスタムトークン方式** で追加します。

1. ブラウザで LINE ログイン → LINE のアクセストークンを取得
2. Route Handler へ送る
3. サーバーが LINE の API でトークンを検証し、LINE ユーザー ID を得る
4. Admin SDK の `createCustomToken(uid)` でカスタムトークンを発行
5. ブラウザが `signInWithCustomToken` でログイン

この方式なら **Firebase UID を軸にしたまま** ログイン手段だけ増やせるので、
Firestore のデータ構造も Security Rules も変更不要です。
(カスタムトークンの発行にはサービスアカウントの
`roles/iam.serviceAccountTokenCreator` が必要です — すでに付与済み)

## 結果

- 認証のセキュリティを Google に任せられました
- Security Rules で `request.auth.uid` がそのまま使えます
- ログイン手段を増やしても、アプリのデータ構造に影響しません

## 見直す条件

- 多要素認証が欲しくなったら Identity Platform へアップグレードします
  (同じサービスの上位プランなので移行は容易)
