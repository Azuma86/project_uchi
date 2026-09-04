# infra — GCP インフラのコード

## 構成

```
infra/
├── terraform/          Terraform による GCP リソース定義
└── gcs-cors.json       Cloud Storage の CORS 設定 (gcloud で適用)
```

## Terraform

### 使い方

```bash
cd infra/terraform

cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を編集する (project_id, github_repository など)

terraform init
terraform plan          # ★ 必ず内容を確認してから apply する
terraform apply

# GitHub Secrets に登録する値を確認する
terraform output github_secrets_checklist
terraform output workload_identity_provider
```

### ファイル構成

| ファイル | 内容 |
|---------|------|
| `versions.tf` | Terraform / プロバイダのバージョン、バックエンド設定 |
| `variables.tf` | 入力変数 (project_id, region など) |
| `apis.tf` | 有効化する GCP API |
| `service-accounts.tf` | サービスアカウントと IAM ロール |
| `storage.tf` | Cloud Storage バケット (非公開 / CORS / ライフサイクル) |
| `artifact-registry.tf` | Docker イメージのリポジトリとクリーンアップポリシー |
| `firestore.tf` | Firestore データベース (削除保護あり) |
| `secrets.tf` | Secret Manager の「入れ物」と IAM |
| `cloud-run.tf` | Cloud Run サービス |
| `workload-identity.tf` | GitHub Actions 用の WIF |
| `monitoring.tf` | アラートポリシー |
| `outputs.tf` | 出力値 |

### 環境を分ける

`terraform.tfvars` を環境ごとに用意します。

```bash
terraform apply -var-file=dev.tfvars
terraform apply -var-file=prod.tfvars
```

state も分ける必要があるため、ワークスペースか
GCS バックエンドの `prefix` を環境ごとに変えてください。

```bash
terraform workspace new prod
terraform workspace select prod
```

### 注意事項

- **`terraform.tfstate` を Git にコミットしない** (`.gitignore` 済み)。
  機密情報が平文で含まれます
- **シークレットの値は Terraform で管理しない**。tfstate に平文で残るため、
  `gcloud secrets versions add` で登録します
- **`terraform destroy` は Firestore を消しません** (`prevent_destroy = true`)。
  意図的に消す場合は `firestore.tf` の設定を外してください
- **Cloud Run のイメージは `ignore_changes`** にしています。
  GitHub Actions が更新するため、Terraform が巻き戻さないようにしています

### Terraform で管理していないもの

| リソース | 理由 |
|---------|------|
| Firebase プロジェクトの追加 | コンソールから行うのが確実 |
| Firebase Authentication のプロバイダ設定 | Terraform 対応が不完全 |
| Security Rules / Firestore インデックス | `firebase deploy` (CI) で管理 |
| Secret Manager の値 | tfstate に平文で残るため |
| Monitoring の通知チャネル | メールアドレスの検証が必要なため |

## gcs-cors.json

ブラウザから署名付き URL で Cloud Storage へ直接アクセスするために必要です。

```bash
# origin を自分の Cloud Run URL に書き換えてから実行
gcloud storage buckets update gs://PROJECT_ID-media --cors-file=infra/gcs-cors.json

# 確認
gcloud storage buckets describe gs://PROJECT_ID-media --format="value(cors_config)"
```

Terraform を使う場合は `storage.tf` の `cors` ブロックが同じ設定を行うため、
このファイルは手動構築時のフォールバックです。
