# GCP 入門 — UCHI+ で実際に使われている場所と一緒に学ぶ

このドキュメントは、GCP をはじめて触る人が
**「用語の意味」と「このアプリのどこで使われているか」をセットで** 理解するためのものです。

教科書的な定義だけを読んでも身につかないので、
各章の最後に必ず「**UCHI+ ではここ**」という節を置いています。
該当するファイルを開きながら読んでください。

---

## 目次

1. [GCP プロジェクトとは](#1-gcp-プロジェクトとは)
2. [リージョンとゾーンとは](#2-リージョンとゾーンとは)
3. [IAM とは](#3-iam-とは)
4. [サービスアカウントとは](#4-サービスアカウントとは)
5. [コンテナとは](#5-コンテナとは)
6. [Artifact Registry とは](#6-artifact-registry-とは)
7. [Cloud Run とは](#7-cloud-run-とは)
8. [Firebase Authentication とは](#8-firebase-authentication-とは)
9. [Cloud Firestore とは](#9-cloud-firestore-とは)
10. [Cloud Storage とは](#10-cloud-storage-とは)
11. [Security Rules とは](#11-security-rules-とは)
12. [Secret Manager とは](#12-secret-manager-とは)
13. [Cloud Logging / Cloud Monitoring とは](#13-cloud-logging--cloud-monitoring-とは)
14. [CI/CD とは](#14-cicd-とは)
15. [Workload Identity Federation とは](#15-workload-identity-federation-とは)
16. [Terraform とは](#16-terraform-とは)
17. [全体像のおさらい](#17-全体像のおさらい)

---

## 1. GCP プロジェクトとは

**プロジェクト = GCP のすべてのリソースを入れる「箱」** です。

作ったデータベース、サーバー、ストレージ、権限設定はすべて
どれか 1 つのプロジェクトに属します。プロジェクトは以下の単位になります。

| 単位 | 意味 |
|------|------|
| 課金 | 請求はプロジェクト単位で集計される |
| 権限 | 「このプロジェクトの閲覧者」のように IAM を付ける |
| 分離 | 別プロジェクトのリソースには (明示的に許可しない限り) アクセスできない |
| 削除 | プロジェクトを消せば中身が全部消える |

プロジェクトには 3 つの識別子があります。

- **プロジェクト ID** — `uchi-plus-dev` のような文字列。**あとから変更できません**
- プロジェクト名 — 表示用。変更できます
- プロジェクト番号 — `123456789012` のような数字。自動採番

### なぜ環境ごとにプロジェクトを分けるのか

開発中の操作ミスで本番の家族写真を消してしまう、という事故を
**構造的に不可能にする** ためです。
権限も課金もプロジェクト境界で切れるので、最も確実な分離手段になります。

```
uchi-plus-dev      … 開発。壊してもよい
uchi-plus-staging  … 本番前の確認
uchi-plus-prod     … 家族が実際に使う
```

### UCHI+ ではここ

- 環境依存の値をコードに書かず、すべて環境変数で渡しています → `src/lib/env.ts`
- `GCP_PROJECT_ID` を差し替えるだけで別プロジェクトへデプロイできます
- Terraform も `project_id` 変数だけで環境を切り替えられます → `infra/terraform/variables.tf`
- **同じ Docker イメージを dev → staging → prod へ昇格できる** 設計にしています。
  そのために `NEXT_PUBLIC_*` (ビルド時に焼き込まれる) を使わず、
  実行時に環境変数を読んでいます → `src/lib/firebase/client-config.ts`

---

## 2. リージョンとゾーンとは

**リージョン = データセンターがある地理的な場所** です。

- `asia-northeast1` = 東京
- `asia-northeast2` = 大阪
- `us-central1` = アイオワ

**ゾーン** はリージョン内の独立した区画 (`asia-northeast1-a` など) で、
1 つのゾーンが落ちても他のゾーンは動き続けます。
Cloud Run のようなマネージドサービスでは、ゾーンは自動で扱われるので意識しません。

### リージョン選びで効いてくること

| 観点 | 説明 |
|------|------|
| **遅延** | 東京の家族が使うなら東京リージョンが速い。米国だと往復で 150ms 以上増える |
| **料金** | リージョンによって単価が違う (東京は米国より少し高め) |
| **転送料** | **同じリージョン内なら通信は基本無料。またぐと課金される** |
| **法令** | データを日本国内に置く要件がある場合に選択の根拠になる |
| **変更不可** | Firestore のロケーションは**作成後に変更できない** |

### UCHI+ ではここ

すべて `asia-northeast1` (東京) に揃えています。

- Cloud Run → `infra/terraform/cloud-run.tf`
- Cloud Storage → `infra/terraform/storage.tf`
- Firestore → `infra/terraform/firestore.tf`
- Artifact Registry → `infra/terraform/artifact-registry.tf`

**揃える理由**: Cloud Run から Cloud Storage への通信が同一リージョン内に収まり、
ネットワーク転送料がかかりません。異なるリージョンにすると、
写真を読むたびにリージョン間転送料が発生します。

---

## 3. IAM とは

**IAM (Identity and Access Management) = 「誰が」「何に対して」「何をできるか」を決める仕組み** です。

3 つの要素で構成されます。

```
   誰が (Principal)          何ができるか (Role)        何に対して (Resource)
┌────────────────────┐    ┌──────────────────────┐   ┌──────────────────┐
│ user:me@gmail.com  │    │ roles/datastore.user │   │ プロジェクト全体  │
│ serviceAccount:... │ ×  │ roles/run.admin      │ × │ このバケットだけ  │
│ group:...          │    │ roles/storage.       │   │ このシークレット  │
└────────────────────┘    │   objectViewer       │   │   だけ           │
                          └──────────────────────┘   └──────────────────┘
```

この 3 つの組み合わせを **IAM ポリシーバインディング** と呼びます。

### ロールの 3 種類

| 種類 | 例 | 使うべきか |
|------|-----|-----------|
| **基本ロール** | Owner / Editor / Viewer | **使わない。** Editor はプロジェクト内のほぼ全部を変更できてしまう |
| **定義済みロール** | `roles/datastore.user`, `roles/storage.objectViewer` | **これを使う。** サービスごとに用途別に用意されている |
| **カスタムロール** | 自分で権限を列挙 | 定義済みで足りないときだけ |

### 最小権限の原則 (Least Privilege)

**「必要な権限だけを、必要な範囲にだけ与える」** — セキュリティの基本原則です。

なぜ重要かというと、権限は **漏れたときの被害の上限** を決めるからです。
アプリのサービスアカウントに Editor を付けていると、
アプリに 1 つ脆弱性があっただけで、
攻撃者はデータベースを消し、課金を膨らませ、ログを改ざんできます。

### 「範囲」を絞ることが特に重要

ロールを絞るだけでなく、**どのリソースに付けるか** も絞ります。

```hcl
# 悪い例: プロジェクト全体のバケットを操作できてしまう
resource "google_project_iam_member" "bad" {
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:app@..."
}

# 良い例: このバケットだけ
resource "google_storage_bucket_iam_member" "good" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:app@..."
}
```

### UCHI+ ではここ

- 付与するロールの一覧 → `infra/terraform/service-accounts.tf`
- バケット単位の付与 → `infra/terraform/storage.tf`
- シークレット単位の付与 → `infra/terraform/secrets.tf`
- **IAM と Security Rules の違い** → [docs/adr/005-security.md](./adr/005-security.md)

---

## 4. サービスアカウントとは

**サービスアカウント = 人間ではなく「プログラム」のための Google アカウント** です。

`uchi-plus-run@uchi-plus-prod.iam.gserviceaccount.com` のような
メールアドレス形式の ID を持ちます。パスワードはありません。

### なぜ必要か

Cloud Run で動くアプリが Firestore を読むとき、
「誰として」読むのかを GCP に伝える必要があります。
そこで「このサービスとして動く」という身元を与えるのがサービスアカウントです。

### 認証方法の 3 段階 (安全な順)

**1. Application Default Credentials (ADC) — 最も安全 ★推奨**

Cloud Run 上のアプリは、メタデータサーバーから
**自動的に短命なアクセストークンを取得** します。
鍵ファイルは存在しません。漏洩のしようがありません。

```ts
initializeApp({ credential: applicationDefault() });  // これだけ
```

**2. Workload Identity Federation — 外部から使うとき**

GitHub Actions のように GCP の外で動くものが、鍵なしで GCP を操作する方法。
→ [15 章](#15-workload-identity-federation-とは)

**3. サービスアカウントキー (JSON) — 最終手段**

`{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY..."}` という
ファイルをダウンロードして使う方法。

**避けるべき理由**:
- 有効期限がない (作った 3 年後も使える)
- 漏洩に気付けない (誰かがコピーしても記録が残らない)
- Git に誤ってコミットする事故が非常に多い
  (GitHub は自動検出して警告しますが、公開された時点で悪用の可能性があります)

### UCHI+ ではここ

- **鍵ファイルを 1 つも作らない構成** です
- Cloud Run では ADC → `src/lib/firebase/admin.ts` の `createApp()`
- GitHub Actions では WIF → `.github/workflows/deploy.yml`
- 万一の保険として `FIREBASE_SERVICE_ACCOUNT_JSON` にも対応していますが、
  使うと警告ログが出ます
- `.gitignore` で `*service-account*.json` などをブロックしています

**サービスアカウントを 2 つに分けている理由** (`infra/terraform/service-accounts.tf`)

| SA | 用途 | 持っている権限 |
|----|------|--------------|
| `uchi-plus-run` | アプリの実行 | Firestore 読み書き / Storage / Secret 読み取り |
| `uchi-plus-deployer` | CI からのデプロイ | イメージ push / Cloud Run 更新 |

アプリが乗っ取られてもデプロイはできず、
CI が漏洩しても家族の写真は読めません。**被害を切り分ける** のが目的です。

---

## 5. コンテナとは

**コンテナ = アプリと、それが動くのに必要なもの一式をまとめた箱** です。

Node.js のバージョン、npm パッケージ、OS のライブラリ、
アプリのコード — これらをまとめて 1 つのイメージにします。

### 何が嬉しいのか

「自分の PC では動くのに本番で動かない」が起きなくなります。
開発機と本番でまったく同じイメージが動くからです。

### Dockerfile の読み方

`Dockerfile` は「イメージの作り方のレシピ」です。UCHI+ の Dockerfile は
**マルチステージビルド** を使っています。

```dockerfile
FROM node:22-alpine AS deps      # 1段目: 依存関係をインストール
FROM node:22-alpine AS builder   # 2段目: ビルド
FROM node:22-alpine AS runner    # 3段目: 実行 (これだけが最終イメージ)
```

最終イメージには **実行に必要なものだけ** が入ります。
ソースコード、TypeScript コンパイラ、テストツールは含まれません。

**なぜ小さくするのか**

| 理由 | 説明 |
|------|------|
| コールドスタート | Cloud Run がイメージを取得する時間が短くなる = 起動が速い |
| 保存料金 | Artifact Registry の保存量が減る |
| セキュリティ | コンパイラやシェルツールが無ければ、侵入されてもできることが減る |

### Cloud Run のための 2 つのお約束

```dockerfile
ENV PORT=8080          # Cloud Run は PORT 環境変数でポートを指定してくる
ENV HOSTNAME=0.0.0.0   # 127.0.0.1 で待つとコンテナ外から届かない
```

`HOSTNAME=0.0.0.0` を忘れると、
「コンテナは起動しているのにヘルスチェックが通らない」という
初心者が最もハマるエラーになります。

### UCHI+ ではここ

- `Dockerfile` — マルチステージ + 非 root ユーザー実行
- `.dockerignore` — `node_modules` や `.env` をイメージに入れない
- `next.config.ts` の `output: 'standalone'` — 必要な依存だけを抽出

---

## 6. Artifact Registry とは

**Artifact Registry = Docker イメージやパッケージの保管庫** です。
GitHub のリポジトリのイメージ版だと思ってください。

古い Container Registry (`gcr.io`) の後継で、こちらを使います。

| | Container Registry | Artifact Registry |
|---|-------------------|-------------------|
| ステータス | 非推奨 | 現行 |
| リージョン | 選択肢が少ない | 細かく選べる |
| 権限 | バケット単位で分かりにくい | リポジトリ単位で IAM が効く |
| 形式 | Docker のみ | Docker / npm / Maven / Python など |

### 使い方の流れ

```bash
# 1. リポジトリを作る (最初の 1 回だけ)
gcloud artifacts repositories create uchi-plus \
  --repository-format=docker --location=asia-northeast1

# 2. Docker に認証情報を設定する (最初の 1 回だけ)
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# 3. ビルドしてタグを付ける
docker build -t asia-northeast1-docker.pkg.dev/PROJECT_ID/uchi-plus/uchi-plus:v1 .

# 4. push する
docker push asia-northeast1-docker.pkg.dev/PROJECT_ID/uchi-plus/uchi-plus:v1
```

イメージ名の構造:

```
asia-northeast1-docker.pkg.dev / PROJECT_ID / uchi-plus  / uchi-plus : v1
└──────── ホスト ────────────┘  └─プロジェクト┘ └リポジトリ┘  └イメージ┘ └タグ┘
```

### タグの付け方

`latest` だけを使うと「今動いているのはどのコードか」が分からなくなります。
UCHI+ では **コミット SHA** をタグにしています。

```yaml
echo "tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
```

障害時に「このリビジョンはこのコミット」と即座に特定できます。

### 課金と掃除

保存量に対して課金されます (月 0.5GB までは無料)。
イメージは 1 つ 100〜300MB あるので、放置すると増え続けます。

UCHI+ では **クリーンアップポリシー** で自動削除しています
(`infra/terraform/artifact-registry.tf`)。

- 直近 10 世代は残す (ロールバック用)
- 30 日より古いものは消す

### UCHI+ ではここ

- `infra/terraform/artifact-registry.tf`
- `.github/workflows/deploy.yml` の build / push ステップ

---

## 7. Cloud Run とは

**Cloud Run = コンテナを「リクエストが来たときだけ」動かすサービス** です。

サーバーの管理 (OS 更新、スケーリング、ロードバランサ、証明書) が一切不要で、
HTTPS の URL が自動で発行されます。

### 最大の特徴: ゼロまでスケールする

```
リクエストなし  →  インスタンス 0 個  →  課金 0 円
リクエスト到着  →  インスタンス起動 (コールドスタート 2〜5 秒)
継続アクセス    →  必要に応じて増える (最大 max-instances まで)
15 分ほど無通信 →  インスタンス 0 個に戻る
```

家族が寝ている間は 1 円もかかりません。これが採用の決め手です。

### 押さえるべき設定

| 設定 | UCHI+ の値 | 意味 |
|------|-----------|------|
| **min instances** | **0** | 待機インスタンス数。0 = 使わない時間は無料。1 以上にすると常時課金 |
| **max instances** | 3 | 上限。暴走時の課金の歯止め |
| **CPU** | 1 | vCPU 数 |
| **メモリ** | 512Mi | Next.js の SSR には 512Mi 程度が現実的 |
| **concurrency** | 80 | 1 インスタンスが同時に捌くリクエスト数。**大きいほどインスタンスが増えず安い** |
| **CPU always allocated** | 無効 | 有効にすると待機中も CPU 課金。バックグラウンド処理が無いので不要 |
| **startup CPU boost** | 有効 | 起動時だけ CPU を増やしてコールドスタートを短縮 |
| **認証** | 未認証を許可 | アプリ側で Firebase Auth を必須にしている |

### 「未認証を許可」は危なくないのか

危なくありません。ここでいう「認証」は **Cloud Run (IAM) の認証** です。

- IAM 認証を有効にすると、Google アカウントの ID トークンが無いと **URL すら開けません**。
  社内 API には適していますが、家族がスマホのブラウザから開くには使えません
- UCHI+ は「URL は誰でも開けるが、**開いてもログイン画面しか見えない**」構成です。
  データへのアクセスは Firebase Authentication と Security Rules が守っています

### リビジョンとロールバック

デプロイのたびに **リビジョン** (バージョン) が作られます。
問題が起きたら 1 コマンドで戻せます。

```bash
gcloud run revisions list --service=uchi-plus --region=asia-northeast1
gcloud run services update-traffic uchi-plus \
  --to-revisions=uchi-plus-00042-abc=100 --region=asia-northeast1
```

### UCHI+ ではここ

- `infra/terraform/cloud-run.tf` — 全設定にコメント付き
- `Dockerfile` — PORT / HOSTNAME 対応
- `src/app/api/health/route.ts` — スタートアッププローブの宛先
- 選定理由 → [docs/adr/002-cloud-run.md](./adr/002-cloud-run.md)

---

## 8. Firebase Authentication とは

**Firebase Authentication = ログイン機能を丸ごと提供してくれるサービス** です。

パスワードのハッシュ化、リセットメールの送信、
Google ログインの OAuth 処理、総当たり攻撃への対策 — 全部やってくれます。

### 中心にあるのは UID

ログインに成功すると、ユーザーに **UID** (`kX9dP2mQ...` のような文字列) が割り当てられます。
ログイン方法 (パスワード / Google / メールリンク) が違っても、
同じユーザーなら同じ UID です。

**この UID をアプリ内部のユーザー ID として使います。**

```
Firebase UID  ─┬─▶ Firestore の users/{userId} のドキュメント ID
               ├─▶ families/{familyId}/members/{userId} のドキュメント ID
               └─▶ Security Rules の request.auth.uid
```

### ID トークンとセッション Cookie

```
[1] ブラウザ    Firebase SDK でログイン
                  ↓ ID トークン (JWT, 1 時間有効) を取得
[2] ブラウザ    POST /api/auth/session { idToken }
[3] サーバー    Admin SDK で ID トークンを検証
                createSessionCookie() でセッション Cookie を発行 (5 日有効)
[4] ブラウザ    Set-Cookie: __session=... (HttpOnly, Secure, SameSite=Lax)
[5] 以降        Server Component が Cookie を検証してユーザーを特定
```

**HttpOnly が重要**: JavaScript から読めない Cookie なので、
XSS (悪意あるスクリプトの埋め込み) が起きてもトークンを盗まれません。
`localStorage` にトークンを置く実装だと、XSS 一発でアカウントを乗っ取られます。

### UCHI+ ではここ

- ブラウザ側のログイン → `src/features/auth/login-form.tsx`
- Cookie の発行 → `src/app/api/auth/session/route.ts`
- サーバー側の検証 → `src/lib/auth/session.ts`
- 選定理由と LINE ログインの追加方法 → [docs/adr/004-auth.md](./adr/004-auth.md)

---

## 9. Cloud Firestore とは

**Firestore = ドキュメント指向の NoSQL データベース** です。

RDB との対応:

| RDB | Firestore |
|-----|-----------|
| テーブル | コレクション |
| 行 | ドキュメント |
| 列 | フィールド |
| — | サブコレクション (ドキュメントの下にコレクションを作れる) |

### 階層構造

```
families (コレクション)
  └── yamada-abc123 (ドキュメント)
        ├── name: "山田家"
        ├── members (サブコレクション)
        │     ├── uid-dad → { role: "admin", displayName: "おとうさん" }
        │     └── uid-kid → { role: "member", displayName: "はなこ" }
        ├── events (サブコレクション)
        ├── photos (サブコレクション)
        └── expenses (サブコレクション)
```

**家族データを全部 `families/{familyId}/` の下に置く** のが UCHI+ の設計の要です。
こうすると Security Rules で家族単位にまとめて守れます。

### RDB との重要な違い

| 項目 | Firestore |
|------|-----------|
| JOIN | **無い**。関連データは別途取得してアプリで結合する |
| 集計 | `SUM`/`GROUP BY` は無い。`count()`/`sum()` の集計クエリは限定的にある |
| 範囲条件 | **複数フィールドに同時に範囲条件を付けられない** |
| スキーマ | 無い。ドキュメントごとに違うフィールドを持てる (= アプリ側の検証が必須) |
| インデックス | 単一フィールドは自動。複数条件は**複合インデックスの事前定義が必要** |
| トランザクション | ある。読んでから書くまでの整合性を保証できる |

### 課金の考え方 — 「読んだドキュメント数」で課金される

ここが RDB と最も違う点です。

```
100 件のドキュメントを取得 = 100 read
1 件のドキュメントを更新   = 1 write
```

**転送量ではなくドキュメント数** です。だから設計で以下を意識します。

- 一覧に `limit` を必ず付ける (UCHI+ では写真 60 枚、経費 100 件)
- 件数だけ欲しいときは `count()` を使う (ドキュメントを読まない)
- 頻繁に一緒に読むデータは非正規化して 1 ドキュメントにまとめる

### 非正規化の実例

UCHI+ では意図的に重複データを持たせています。

| フィールド | 場所 | 理由 |
|-----------|------|------|
| `users/{uid}.familyIds` | ユーザー | 所属家族の検索を 1 read で済ませる |
| `expenses.yearMonth` | 経費 | 月次集計を等価条件 1 つで引く |
| `albums.photoCount` | アルバム | 一覧のたびに写真を数え直さない |
| `members.displayName` | メンバー | 表示のたびに users を読まない |

RDB なら JOIN で済むところを、Firestore では
**「read を減らすために書き込み時にコピーしておく」** のが定石です。

### トランザクション

「読んでから書く」の間に他の人が書き換えていたら、やり直します。

```ts
await db.runTransaction(async (tx) => {
  const snap = await tx.get(ref);
  if (snap.data().status !== 'pending') throw conflict('すでに処理済みです');
  tx.update(ref, { status: 'approved' });
});
```

UCHI+ では、2 人の管理者が同時に承認ボタンを押しても
片方だけが成功するようにこれを使っています
(`src/lib/data/expenses.ts` の `reviewExpense`)。
この挙動は実際にテストで検証しています
(`tests/integration/family-and-expenses.test.ts` の「二重承認はトランザクションで防がれる」)。

### UCHI+ ではここ

- データモデル → `src/lib/data/paths.ts`
- 各コレクションの操作 → `src/lib/data/*.ts`
- インデックス定義 → `firebase/firestore.indexes.json`
- 選定理由 → [docs/adr/001-firestore-vs-cloud-sql.md](./adr/001-firestore-vs-cloud-sql.md)

---

## 10. Cloud Storage とは

**Cloud Storage = 大きなファイルを置くための保管庫** です。

画像・動画・バックアップなど、データベースに入れるには大きすぎるものを置きます。

### 用語

- **バケット** — ファイルを入れる入れ物。名前は**全世界で一意**
- **オブジェクト** — 1 つのファイル。`families/abc/photos/xxx.webp` のようなキーを持つ

`/` が入っていてもフォルダは存在しません。すべては 1 つの平たいキー空間で、
`/` は単なる文字です (見た目のためにコンソールがフォルダ風に表示します)。

### ストレージクラス

| クラス | 用途 | 特徴 |
|--------|------|------|
| **Standard** | 頻繁に読む | 保存料は高め、取り出し無料 ← UCHI+ はこれ |
| Nearline | 月 1 回程度 | 保存料が安い、取り出しに料金、最低 30 日 |
| Coldline | 四半期に 1 回 | さらに安い、最低 90 日 |
| Archive | ほぼ読まない | 最安、最低 365 日 |

家族写真は「いつ見返すか分からない」ので Standard にしています。
安いクラスは**取り出すたびに課金**され、最低保存期間より早く消すと違約金がかかります。

### 絶対に守ること: 公開しない

```hcl
uniform_bucket_level_access = true    # オブジェクト単位の ACL を無効化
public_access_prevention    = "enforced"  # 公開設定を構成レベルで禁止
```

`allUsers` に読み取り権限を付けると、**URL を知っている全世界の人が見られます**。
家族写真では絶対に避けます。
UCHI+ では Terraform で公開を構成レベルで禁止しています。

### 署名付き URL (Signed URL)

非公開のまま、特定のファイルへの一時的なアクセスを許可する仕組みです。

```
https://storage.googleapis.com/bucket/families/abc/photos/xxx.webp
  ?X-Goog-Algorithm=GOOG4-RSA-SHA256
  &X-Goog-Expires=1800          ← 30 分で失効
  &X-Goog-Signature=abc123...   ← サーバーが署名
```

この URL を持っている人だけが、期限内だけアクセスできます。
Google アカウントは不要です。

**署名に必要な IAM (ハマりどころ)**

Cloud Run 上の ADC には秘密鍵がありません。
そのためライブラリは IAM Credentials API の `signBlob` を使って署名します。
これには **サービスアカウント自身に対する** `roles/iam.serviceAccountTokenCreator` が必要です。

```hcl
resource "google_service_account_iam_member" "app_token_creator" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.app.email}"  # 自分自身
}
```

「自分に自分の権限を付ける」ので不思議に見えますが、これが正しい設定です。
`iamcredentials.googleapis.com` の有効化も必要です。

### CORS

ブラウザから署名付き URL へ直接アクセスするには、バケットの CORS 設定が必要です。

```bash
gcloud storage buckets update gs://BUCKET --cors-file=infra/gcs-cors.json
```

設定を忘れると、ブラウザのコンソールに CORS エラーが出てアップロードできません。

### UCHI+ ではここ

- 署名付き URL の発行 → `src/lib/storage/gcs.ts`
- パスの生成と検証 → `src/lib/storage/paths.ts`
- バケット設定 → `infra/terraform/storage.tf`
- 設計理由 → [docs/adr/003-storage.md](./adr/003-storage.md)

---

## 11. Security Rules とは

**Security Rules = Firestore / Cloud Storage に組み込まれたアクセス制御** です。

**データベース自身が持つファイアウォール** だと思ってください。
アプリのコードを一切通らないアクセスも、ここで止まります。

### なぜアプリ側のチェックだけでは駄目なのか

Firestore は **インターネットに直接公開された API** です。
ログイン済みのユーザーがブラウザの DevTools で自分の ID トークンを取り出せば、
こちらのアプリを経由せずに Firestore を直接叩けます。

```js
// 悪意あるメンバーがブラウザのコンソールで実行できてしまうこと
await fetch('https://firestore.googleapis.com/v1/projects/.../documents/families/他人の家族/expenses',
  { headers: { Authorization: `Bearer ${idToken}` } });
```

このとき唯一の防御が Security Rules です。

### 基本の書き方

```
match /families/{familyId}/expenses/{expenseId} {
  allow read: if isMember(familyId);
  allow create: if isMember(familyId)
    && request.resource.data.applicantUserId == request.auth.uid;
}
```

| 変数 | 意味 |
|------|------|
| `request.auth.uid` | ログイン中のユーザーの UID (未ログインなら `request.auth` が null) |
| `resource.data` | **変更前**のドキュメントの中身 |
| `request.resource.data` | **書き込もうとしている**中身 |
| `request.time` | サーバーの現在時刻 |

`resource` と `request.resource` の使い分けが要点です。
「今 pending であるものを approved にする」は

```
resource.data.status == 'pending' && request.resource.data.status == 'approved'
```

と書きます。

### UCHI+ の中心的なルール

**家族の分離** — パス上の `familyId` に対して、自分のメンバードキュメントが
存在するかを確認します。クライアントが `familyId` を書き換えても、
その家族のメンバーでなければ `exists()` が false になるので通りません。

```
function isMember(familyId) {
  return request.auth != null
    && exists(/databases/$(database)/documents/families/$(familyId)/members/$(request.auth.uid));
}
```

**承認は管理者だけ、しかも pending からだけ**

```
function isAdminReview(familyId) {
  return isAdmin(familyId)
    && resource.data.status == 'pending'                    // 承認待ちからのみ
    && request.resource.data.status in ['approved','rejected']
    && request.resource.data.reviewedBy == request.auth.uid // 審査者を詐称できない
    && changedKeysWithin(['status','adminComment','reviewedBy','reviewedAt','updatedAt']);
                                                            // 金額の改ざんを防ぐ
}
```

最後の `changedKeysWithin` が効いています。
これが無いと、管理者が承認と同時に金額を書き換えられてしまいます。

### Admin SDK はルールをバイパスする

**重要**: サーバー側の Admin SDK は Security Rules を無視します。
だからサーバーでは自分で権限チェックを書く必要があります
(`src/lib/permissions/`)。

### 必ずテストする

Security Rules は「書いたつもり」と「実際の挙動」がずれやすい領域です。
UCHI+ では Firebase Emulator を使って **62 件のテスト** を書いています。

```bash
npm run test:rules
```

### UCHI+ ではここ

- `firebase/firestore.rules` — 全ルールに日本語コメント付き
- `firebase/storage.rules` — 署名付き URL 方式なので全拒否
- `tests/rules/firestore.test.ts` — 62 件のテスト
- IAM との違い → [docs/adr/005-security.md](./adr/005-security.md)

---

## 12. Secret Manager とは

**Secret Manager = API キーやパスワードを安全に保管するサービス** です。

### 何を入れて、何を入れないか

| 入れる (秘密) | 入れない (公開してよい) |
|--------------|----------------------|
| LINE のチャネルアクセストークン | Firebase の apiKey |
| 外部 API の秘密鍵 | プロジェクト ID |
| DB のパスワード | バケット名 |
| Webhook の署名シークレット | Cloud Run の URL |

**Firebase の apiKey は秘密ではありません。**
これは「どのプロジェクトか」を示す識別子で、ブラウザに配られる前提のものです。
アクセス制御は Firebase Authentication と Security Rules が行います。
(ただし Google Cloud コンソールで HTTP リファラー制限をかけておくのは有効です)

### 特徴

- **バージョン管理** — シークレットを更新すると新バージョンになり、古い値も残る
- **監査ログ** — 誰がいつアクセスしたか記録される
- **細かい IAM** — 「このシークレットだけ読める」という権限を付けられる

### Cloud Run での使い方 (2 通り)

**方法 1: 環境変数として注入 ★推奨**

```hcl
env {
  name = "LINE_CHANNEL_ACCESS_TOKEN"
  value_source {
    secret_key_ref { secret = "LINE_CHANNEL_ACCESS_TOKEN"; version = "latest" }
  }
}
```

Cloud Run がインスタンス起動時に取得して環境変数に入れてくれます。
アプリは `process.env.LINE_CHANNEL_ACCESS_TOKEN` を読むだけです。

**利点**: コールドスタート時に API 呼び出しが増えない (起動が速い = 課金時間が短い)

**方法 2: アプリから API で取得**

ローテーションを即座に反映したい場合に使います。
UCHI+ は方法 1 を基本にしつつ、方法 2 のフォールバックも実装しています
(`src/lib/secrets/index.ts`)。

### 値の登録

Terraform では **シークレットの「入れ物」だけ** を作ります。
中身を Terraform に書くと **tfstate に平文で残る** ためです。

```bash
echo -n "実際のトークン" | gcloud secrets versions add LINE_CHANNEL_ACCESS_TOKEN \
  --data-file=- --project=PROJECT_ID
```

### UCHI+ ではここ

- 取得ロジック → `src/lib/secrets/index.ts`
- 入れ物の定義と IAM → `infra/terraform/secrets.tf`
- Cloud Run への注入 → `infra/terraform/cloud-run.tf`
- 公開設定と秘密の分離 → `src/lib/env.ts`

---

## 13. Cloud Logging / Cloud Monitoring とは

### Cloud Logging

**Cloud Run の標準出力に出た内容が、自動的に Cloud Logging へ送られます。**
エージェントの設定は不要です。

**ただの文字列と JSON では扱いが変わります。**

```js
console.log('エラーが発生しました');
// → textPayload。severity は全部 INFO。検索も絞り込みもできない

console.log(JSON.stringify({ severity: 'ERROR', message: '...', userId: 'abc' }));
// → jsonPayload。severity で絞れる。userId で検索できる
```

だから **構造化ログ** を出します。UCHI+ の `src/lib/logging/logger.ts` は
`severity` / `message` / `userId` / `familyId` / `action` を JSON で出力します。

**ログに個人情報を出さない**

ログは長期間保存され、閲覧できる人も増えます。
UCHI+ のロガーは、危険なキーを自動的に `[REDACTED]` に置き換えます。

```ts
const REDACTED_KEYS = new Set(['password','token','email','signedUrl','storagePath', ...]);
```

出すのは **識別子** (userId, familyId) だけ。
「誰が何をしたか」は追えるが、「何を買ったか」は残らない、という線引きです。

**便利なクエリ**

```
resource.type="cloud_run_revision" severity>=ERROR
resource.type="cloud_run_revision" jsonPayload.familyId="xxx"
resource.type="cloud_run_revision" jsonPayload.action="expense.approved"
```

**課金に注意**: 毎月 50GiB まで無料ですが、
デバッグログを大量に出すと超えます。本番では `LOG_LEVEL=info` にします。

### Cloud Monitoring

**メトリクス (数値の時系列) を見て、異常を検知する仕組み** です。

Cloud Run は以下を自動で記録します。

| メトリクス | 見るポイント |
|-----------|------------|
| Request count | アクセス数。急増は攻撃かクロールの兆候 |
| Request latency | 応答時間。p95 が数秒ならコールドスタートが多い |
| Container instance count | インスタンス数。**課金に直結** |
| Container CPU / Memory utilization | メモリが 100% に近いと OOM で落ちる |

**アラートポリシー** を設定すると、条件を満たしたときにメールが届きます。

UCHI+ では 2 つ設定しています (`infra/terraform/monitoring.tf`)。

1. **5xx エラーが 5 分で 5 件以上** → 壊れているのに気付かない事態を防ぐ
2. **インスタンス数が 2 を超える状態が 10 分継続** → 想定外の課金の兆候

家族アプリでは「壊れて気付かない」「課金が膨らむ」の 2 つだけ押さえれば十分です。

### UCHI+ ではここ

- ロガー → `src/lib/logging/logger.ts`
- アラート → `infra/terraform/monitoring.tf`
- 確認手順 → [README の Monitoring](../README.md#monitoring)

---

## 14. CI/CD とは

- **CI (継続的インテグレーション)** — コードを push するたびに自動でテストする
- **CD (継続的デリバリー/デプロイ)** — テストが通ったら自動でデプロイする

### なぜ必要か

手作業でデプロイしていると、

- 手順を間違える (ビルドし忘れ、環境変数の設定漏れ)
- テストを飛ばしてしまう
- 「誰が何をデプロイしたか」が残らない

CI/CD にすると **毎回同じ手順** が実行され、記録も残ります。

### GitHub Actions と Cloud Build

UCHI+ は **GitHub Actions** を採用しました。

| | GitHub Actions ★採用 | Cloud Build |
|---|---------------------|-------------|
| 場所 | GitHub | GCP |
| 設定 | `.github/workflows/*.yml` | `cloudbuild.yaml` |
| PR 連携 | ネイティブ。チェック結果が PR に出る | Webhook 経由で連携が必要 |
| 無料枠 | パブリックリポジトリは無制限、プライベートは月 2,000 分 | 月 120 分 |
| GCP 認証 | **WIF で鍵なし** | プロジェクト内なので最初から権限がある |
| 学習価値 | **WIF を学べる** | GCP 完結の手軽さ |

**採用理由**:
1. コードは GitHub にあり、PR でテスト結果を見るのが自然
2. 無料枠が大きい (Cloud Build の月 120 分はビルド数回分で尽きる)
3. **Workload Identity Federation を学べる** — 実務で最も重要な認証パターン

### UCHI+ のパイプライン

```
git push (main)
   ↓
[CI]     lint → typecheck → unit test → rules test → build
   ↓
[認証]   GitHub OIDC → Workload Identity Federation → GCP
   ↓
[ビルド] docker build → Artifact Registry へ push
   ↓
[デプロイ] Cloud Run の新しいリビジョンを作成
   ↓
[ルール] Firestore の Security Rules とインデックスを反映
```

最後のステップが重要です。
**アプリだけ更新してルールが古いままだと、権限エラーで動きません。**
必ずセットでデプロイします。

### UCHI+ ではここ

- `.github/workflows/ci.yml` — PR での検証
- `.github/workflows/deploy.yml` — main へのマージでデプロイ

---

## 15. Workload Identity Federation とは

**WIF = 外部のシステムが、鍵ファイルなしで GCP を操作できるようにする仕組み** です。

### 解決したい問題

GitHub Actions から GCP を操作するには認証が必要です。
素朴な方法は「サービスアカウントの鍵 (JSON) を GitHub Secrets に入れる」ですが、

- 鍵に**有効期限がない** (作った 3 年後も有効)
- 漏洩しても**気付けない**
- 定期的なローテーションが必要だが、実際にはやらない
- GitHub Secrets が漏れたら GCP を自由に操作されてしまう

### WIF の仕組み

**「鍵を渡す」のではなく「身元を証明させる」** 方式です。

```
[1] GitHub Actions が OIDC トークンを発行
      「私は github.com/your-name/uchi-plus の main ブランチで動いています」
      (GitHub が署名。偽造できない)
                    ↓
[2] GCP の Workload Identity Pool がトークンを検証
      発行者は本当に GitHub か? → issuer_uri で確認
      リポジトリは許可されたものか? → attribute_condition で確認
                    ↓
[3] 条件を満たせば、デプロイ用サービスアカウントの
    短命なアクセストークン (1 時間) を発行
                    ↓
[4] GitHub Actions がそのトークンで Cloud Run へデプロイ
```

**保存される鍵はどこにもありません。**

### 設定で最も重要な 1 行

```hcl
attribute_condition = "attribute.repository == 'your-name/uchi-plus'"
```

**これが無いと、世界中のどの GitHub リポジトリからでも
あなたの GCP プロジェクトを操作できてしまいます。**

WIF の設定ミスとして最も多く、最も危険なものです。必ず入れてください。
さらに厳しくするなら、ブランチも固定できます。

```hcl
attribute_condition = "attribute.repository == 'your-name/uchi-plus' && attribute.ref == 'refs/heads/main'"
```

### GitHub Actions 側

```yaml
permissions:
  id-token: write   # ← これが無いと OIDC トークンを発行できない
  contents: read

steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
      service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
```

`permissions: id-token: write` の書き忘れが、
WIF が動かないときの原因の 9 割です。

### UCHI+ ではここ

- `infra/terraform/workload-identity.tf` — プール / プロバイダ / 条件
- `.github/workflows/deploy.yml` — 認証ステップ
- 設定手順 → [README のセットアップ](../README.md#12-workload-identity-federation-の設定)

---

## 16. Terraform とは

**Terraform = インフラをコードで管理するツール** (Infrastructure as Code) です。

コンソールでポチポチ作る代わりに、設定ファイルに書いて `terraform apply` します。

### 何が嬉しいのか

| 手作業 (コンソール) | Terraform |
|-------------------|-----------|
| 手順書が古くなる | コードが常に現状を表す |
| 環境ごとに設定がずれる | 変数を変えるだけで同じ構成を再現 |
| 誰が何を変えたか不明 | Git の履歴に残る |
| 消したものは戻らない | コードから作り直せる |
| レビューできない | PR でレビューできる |

### 基本の流れ

```bash
terraform init      # プロバイダのダウンロード (最初の 1 回)
terraform plan      # 何が作られる/変わるかを確認 (実行はしない)
terraform apply     # 実際に反映する
terraform destroy   # 全部消す (開発環境の後始末に)
```

**`plan` を必ず見る習慣** が大切です。
意図しない削除 (`- destroy`) が含まれていないかを確認します。

### tfstate — 最重要ファイル

Terraform は「今どんなリソースを管理しているか」を `terraform.tfstate` に記録します。

- **Git にコミットしない** (機密情報が入る)
- チームで使うなら **GCS バックエンド** に置く (排他制御も効く)
- 消すと Terraform が「何も管理していない」と誤認する

UCHI+ では学習用途のためローカル state を既定にし、
GCS バックエンドの設定例をコメントで書いています (`infra/terraform/versions.tf`)。

### Terraform で管理しないもの

**すべてをコード化する必要はありません。** UCHI+ では以下を手動にしています。

| リソース | 手動にした理由 |
|---------|--------------|
| Firebase プロジェクトの追加 | GCP プロジェクトへ Firebase を有効化する操作。コンソールが確実 |
| Firebase Authentication のプロバイダ設定 | Terraform 対応が不完全で、コンソールの方が速い |
| Security Rules | `firebase deploy` の方が反復開発に向く。CI でデプロイしている |
| シークレットの値 | tfstate に平文で残るため。`gcloud` で登録する |

### lifecycle による保護

```hcl
lifecycle {
  prevent_destroy = true          # terraform destroy で消させない
  ignore_changes  = [template[0].containers[0].image]  # CI が更新する項目は無視
}
```

`ignore_changes` を Cloud Run のイメージに付けているのは、
GitHub Actions がイメージを更新するためです。
これが無いと `terraform apply` のたびに古いイメージへ巻き戻ります。

### UCHI+ ではここ

- `infra/terraform/` — 全ファイルに日本語コメント付き
- `infra/terraform/terraform.tfvars.example` — 設定例

---

## 17. 全体像のおさらい

ここまでの要素が、UCHI+ でどうつながっているかをまとめます。

```mermaid
graph TB
    subgraph dev["開発者"]
        LOCAL["ローカル開発<br/>Firebase Emulator"]
        GH["GitHub<br/>コードを push"]
    end

    subgraph cicd["CI/CD"]
        GA["GitHub Actions<br/>lint / test / build"]
        WIF["Workload Identity<br/>Federation<br/>(鍵なし認証)"]
    end

    subgraph gcp["GCP プロジェクト (asia-northeast1)"]
        AR["Artifact Registry<br/>Docker イメージ"]
        RUN["Cloud Run<br/>Next.js<br/>min-instances=0"]
        FS["Cloud Firestore<br/>家族データ"]
        GCS["Cloud Storage<br/>写真・領収書<br/>(非公開)"]
        SM["Secret Manager<br/>LINE トークン等"]
        AUTH["Firebase Auth<br/>ログイン"]
        LOG["Cloud Logging"]
        MON["Cloud Monitoring"]
        SA["Service Account<br/>uchi-plus-run"]
    end

    FAMILY(["家族<br/>スマホ / PC"])

    LOCAL -.-> GH
    GH --> GA
    GA --> WIF
    WIF --> AR
    WIF --> RUN
    AR --> RUN

    FAMILY -->|HTTPS| RUN
    FAMILY -->|ログイン| AUTH
    FAMILY -->|署名付き URL で直接| GCS

    RUN -.->|as| SA
    SA --> FS
    SA --> GCS
    SA --> SM
    SA --> AUTH
    RUN --> LOG
    LOG --> MON
```

### 1 つの操作を追いかける — 「経費を承認する」

```
1. おかあさんがスマホでアプリを開く
      Cloud Run がインスタンスを起動 (min-instances=0 なので寝ていた)

2. セッション Cookie を検証
      Firebase Auth (Admin SDK) が検証 → UID を得る

3. 家族と権限を解決
      Firestore を 3 read (users / families / members)
      → 「山田家の admin」と判明

4. 承認待ち一覧を表示
      Firestore で status == 'pending' を検索

5. 領収書を表示
      Cloud Storage の署名付き URL をサーバーが発行 (30 分有効)
      ブラウザが GCS から直接ダウンロード (Cloud Run を経由しない)

6. 「承認する」を押す
      Server Action → requireAdminAccess() で admin を確認
      → transaction で「pending なら approved にする」
      → Security Rules も同じ条件を持っている (多層防御)

7. 通知
      NotificationService (初期版は Console) が呼ばれる
      将来 LINE に差し替え可能

8. ログ
      { severity: "INFO", action: "expense.approved", userId, familyId }
      が Cloud Logging へ (金額や店舗名は出さない)

9. 15 分後
      アクセスが途絶えるとインスタンスが 0 に戻り、課金が止まる
```

### 学習の次の一歩

この構成を理解したら、次はこのあたりが自然な発展先です。

| やりたいこと | 使うサービス |
|------------|------------|
| 領収書から金額を自動読み取り | Cloud Vision API (`src/lib/ocr/` に差し替え口あり) |
| 明日の予定を毎晩 LINE 通知 | Cloud Scheduler + Cloud Run ジョブ |
| 家計の推移を分析 | BigQuery への Firestore エクスポート |
| 画像配信を高速化 | Cloud CDN |
| 独自ドメイン | Cloud Run のドメインマッピング |

ただし **必要になってから足す** こと。
使っていないサービスを増やすと、課金と管理対象と攻撃対象が増えるだけです。
