# ADR 005: Security Rules と IAM をどう使い分けるか

- ステータス: 採用
- 日付: 2026-09-04

## 状況

GCP には「アクセス制御」の仕組みが 2 つあり、初心者が最も混乱するところです。

- **IAM** (Identity and Access Management)
- **Security Rules** (Firestore / Cloud Storage)

どちらも「誰が何をできるか」を決めますが、**守る対象と登場人物が違います。**

## 決定

役割を次のように分けます。

| | IAM | Security Rules |
|---|-----|----------------|
| **誰を制御するか** | Google アカウント / **サービスアカウント** (= 開発者とプログラム) | **アプリのエンドユーザー** (= 家族一人ひとり) |
| **どこに書くか** | GCP プロジェクトの設定 (Terraform) | `firebase/firestore.rules` (Git 管理) |
| **粒度** | サービス / リソース単位 (「このバケットを読める」) | ドキュメント / フィールド単位 (「この経費の status を pending から approved にできる」) |
| **例** | Cloud Run の SA が Firestore を読み書きできる | 山田家の member は鈴木家の経費を読めない |

**一言でいうと:**

- **IAM** = 「**どのプログラムが**どのサービスを使えるか」
- **Security Rules** = 「**どの家族の誰が**どのデータを触れるか」

IAM は「はなこさん」を知りません。IAM から見えるのは
「uchi-plus-run というサービスアカウント」だけです。
逆に Security Rules は「Cloud Run」も「Artifact Registry」も知りません。
Security Rules が見るのは `request.auth.uid` (Firebase UID) だけです。

## このアプリでの具体的な流れ

```
はなこ (family member)
   │  Firebase Auth でログイン
   ▼
ブラウザ ──── HTTPS ────▶ Cloud Run
                            │  ここまでは「はなこ」として動く
                            │  ↓ ここから先は「サービスアカウント」として動く
                            ├──▶ Firestore     … IAM: roles/datastore.user
                            ├──▶ Cloud Storage … IAM: roles/storage.objectAdmin (このバケットのみ)
                            └──▶ Secret Manager… IAM: roles/secretmanager.secretAccessor (該当シークレットのみ)
```

重要な点として、**Admin SDK は Security Rules をバイパスします。**
Cloud Run のサーバーコードは「管理者権限」で Firestore に触れるため、
Security Rules は一切適用されません。

だから、サーバー側では **自分で権限チェックを書く必要があります。**
それが `src/lib/permissions/index.ts` と `src/lib/auth/session.ts` です。

## では Security Rules は何のためにあるのか

「サーバー経由でしか触らないなら Security Rules は不要では?」
という疑問が湧きますが、**必要です。**

Firestore は **インターネットに直接公開された API** です。
ログインした家族の 1 人がブラウザの DevTools を開き、
自分の ID トークンを取り出せば、こちらのアプリを一切通さずに
`firestore.googleapis.com` を直接叩けます。

```js
// 悪意のあるメンバーがブラウザのコンソールで実行できてしまうこと
await fetch('https://firestore.googleapis.com/v1/projects/.../documents/families/鈴木家/expenses', {
  headers: { Authorization: `Bearer ${idToken}` }
})
```

このとき唯一の防御が **Security Rules** です。
アプリのコードは一切通りません。

## 三層の防御

本アプリでは同じ判定を 3 か所に書いています。冗長ですが意図的です。

| 層 | 場所 | 何を守るか | 破られたら |
|----|------|-----------|-----------|
| 1. Security Rules | `firebase/firestore.rules` | Firestore API への直接アクセス | データベースが丸見えになる |
| 2. Server Action | `src/lib/permissions/` + `src/lib/auth/session.ts` | アプリ経由の操作 | アプリ経由で不正操作できる |
| 3. UI | 各コンポーネント | 誤操作の防止 (**防御ではない**) | ボタンが見えるだけ。実害なし |

UI の出し分けは **利便性のため** であって、防御ではありません。
`session.role === 'admin'` は DevTools で書き換えられます。
だから 2 と 1 が必ず要ります。

## 具体例: 経費の承認

「member は経費を承認できない」を 3 層で表現しています。

**1. Security Rules** (`firebase/firestore.rules`)

```
function isAdminReview(familyId) {
  return isAdmin(familyId)                        // 管理者であること
    && resource.data.status == 'pending'          // 承認待ちであること
    && request.resource.data.reviewedBy == uid()  // 審査者を詐称できない
    && changedKeysWithin([...]);                  // 金額の改ざんを防ぐ
}
```

**2. Server Action** (`src/features/expenses/actions.ts`)

```ts
const session = await requireAdminAccess(parsed.data.familyId); // admin でなければ 403
await reviewExpense({ ... });                                    // 中でも transaction で再確認
```

**3. UI** (`src/app/(app)/expenses/[expenseId]/page.tsx`)

```tsx
canReview: canReviewExpense({ role: session.role, ... })  // ボタンを出すかどうか
```

## 最小権限 (Least Privilege) の適用

アプリ用サービスアカウントには **Editor も Owner も付けません。**

| ロール | 付与理由 |
|--------|---------|
| `roles/datastore.user` | Firestore の読み書き。`datastore.owner` はインデックス操作もできてしまうので使わない |
| `roles/storage.objectAdmin` | **このバケットに対してのみ**。プロジェクト全体には付けない |
| `roles/secretmanager.secretAccessor` | **該当シークレットに対してのみ** |
| `roles/logging.logWriter` | ログの書き込みのみ (読み取りは不可) |
| `roles/iam.serviceAccountTokenCreator` | 署名付き URL の生成に必要 (自分自身に対して) |
| `roles/firebaseauth.admin` | セッション Cookie の発行。これより狭い定義済みロールが無い |

デプロイ用サービスアカウントは **別に用意** し、
家族のデータへのアクセス権を持たせていません。
CI が漏洩しても写真や家計は読まれません。

## 結果

- 「アプリのバグ = 即データ漏洩」にならない構成になりました
- 同じルールを 2 か所 (Rules と permissions) に書く手間が発生します。
  ずれないよう、`firebase/firestore.rules` のコメントに対応関係を書き、
  両方をテストしています (`tests/rules/` と `tests/unit/permissions.test.ts`)

## 見直す条件

- ルールの二重管理が負担になったら、
  Rules を単純化してサーバー経由に一本化することも考えられますが、
  **防御層が 1 枚減る** ことを理解した上で判断すべきです
