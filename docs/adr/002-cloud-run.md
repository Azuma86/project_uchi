# ADR 002: なぜ Cloud Run を採用したか

- ステータス: 採用
- 日付: 2026-09-04

## 状況

Next.js (App Router / Server Components / Server Actions) を動かす場所が必要です。

- アクセスは 1 日数回〜数十回、深夜はゼロ
- Node.js のサーバーが必要 (静的サイトでは成立しない)
- 家族しか使わないので、多少のコールドスタートは許容できる
- GCP の学習も目的なので、GCP のサービスを使いたい

## 決定

**Cloud Run** にコンテナとしてデプロイします。

- min instances = 0
- max instances = 3
- CPU 1 / メモリ 512Mi
- CPU always allocated は無効 (`cpu_idle = true`)
- リージョン: asia-northeast1 (東京)

## 検討した選択肢

### A. Cloud Run ← 採用

**利点**
- **ゼロまでスケールする**。リクエストが無い間はインスタンスが 0 になり、課金されません。
  「深夜は誰も使わない家族アプリ」に最も効きます。
- **コンテナなので何でも動く**。Next.js の standalone 出力をそのまま実行できます。
- **HTTPS とドメインが自動**。証明書の管理が不要です。
- **リクエスト単位の課金**。使った分だけ。
- Docker と Artifact Registry の学習にもなります。

**欠点**
- **コールドスタート**。久しぶりのアクセスで 2〜5 秒待つことがあります。
  `startup_cpu_boost` を有効にして緩和していますが、ゼロにはなりません。
  家族向けなので許容しました。
  どうしても気になる場合は min instances = 1 にできますが、
  常時 1 インスタンス分 (月あたり千円前後) の課金が発生します。

### B. App Engine (Standard / Flexible)

Standard はゼロスケールしますが、
ランタイムの制約が強く、Next.js のようなアプリはコンテナ (Flexible) 側になります。
Flexible は最低 1 インスタンスが常時稼働するため、常時課金です。
また、GCP の新規プロジェクトでは Cloud Run が推奨経路になっています。

### C. GKE (Kubernetes)

**明確に過剰です。**
コントロールプレーンだけで月 1 万円近くかかり、
ノードも常時稼働します。家族 3 人のアプリに Kubernetes は要りません。
「学習のため」に入れたくなりますが、
本プロジェクトの方針は「必要な GCP サービスを正しく理解して使う」ことなので、
必要性の無いサービスは入れません。

### D. Firebase Hosting + Cloud Functions

Firebase Hosting だけでは Next.js の SSR が動かず、
結局 Cloud Functions か Cloud Run が背後に必要になります。
それなら最初から Cloud Run 1 つにした方が構成が単純です。

### E. Vercel

Next.js を動かすなら最も手軽です。
ただし本プロジェクトの目的の 1 つが **GCP の学習** なので採用しません。
(実利だけを考えるなら有力な選択肢です)

## 設定の根拠

| 設定 | 値 | 理由 |
|------|-----|------|
| min instances | 0 | 使わない時間の課金をゼロにする。最重要のコスト対策 |
| max instances | 3 | 暴走・攻撃時の課金上限。家族利用なら 1 で足りるが余裕を持たせた |
| CPU | 1 | Next.js の SSR には最低 1 vCPU が現実的 |
| メモリ | 512Mi | standalone 出力の Next.js は 256Mi では OOM のリスクがある |
| concurrency | 80 | 同時 80 リクエストを 1 インスタンスで捌く。インスタンス数が減り安くなる |
| CPU always allocated | 無効 | 有効にすると待機中も課金される。バックグラウンド処理が無いので不要 |
| startup CPU boost | 有効 | コールドスタートを短縮。追加費用は僅少 |
| 認証 | 未認証を許可 | アプリ側で Firebase Auth によるログインを必須にしている |
| リージョン | asia-northeast1 | 日本の家族が使うため。Firestore・GCS と同一リージョンに揃えて転送料と遅延を抑える |

## 結果

- 使っていない時間の費用がゼロになりました
- 「Docker イメージを作って Artifact Registry に置き、Cloud Run で動かす」という
  クラウドの標準的な流れを一通り学べる構成になりました
- 引き換えに、たまにコールドスタートで数秒待つことがあります

## 見直す条件

- 家族から「開くのが遅い」と苦情が出たら min instances = 1 を検討します
  (コストとのトレードオフを README のコスト章で説明しています)
- バックグラウンドで定期処理 (明日の予定を LINE 通知するなど) を始めるなら、
  Cloud Scheduler + Cloud Run ジョブを追加します
