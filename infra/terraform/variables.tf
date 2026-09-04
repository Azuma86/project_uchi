variable "project_id" {
  description = "GCP プロジェクト ID (環境ごとに分ける場合はここを変える)"
  type        = string
}

variable "region" {
  description = <<-EOT
    リージョン。asia-northeast1 (東京) を既定とする。
    日本の家族が使うので、物理的に近い = レイテンシが小さい。
    大阪 (asia-northeast2) でもよいが、対応サービスと料金が微妙に異なる。
  EOT
  type        = string
  default     = "asia-northeast1"
}

variable "environment" {
  description = "環境名 (dev / staging / prod)。リソース名の接尾辞に使う。"
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Cloud Run サービス名"
  type        = string
  default     = "uchi-plus"
}

variable "container_image" {
  description = <<-EOT
    Cloud Run にデプロイするコンテナイメージ。
    初回はプレースホルダで作成し、以降は GitHub Actions が更新する
    (lifecycle.ignore_changes でイメージの差分は無視している)。
  EOT
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "github_repository" {
  description = "GitHub Actions からのデプロイを許可するリポジトリ (owner/repo)"
  type        = string
  default     = ""
}

variable "app_url" {
  description = "アプリの公開 URL。Cloud Run の URL かカスタムドメイン。"
  type        = string
  default     = ""
}

variable "firebase_api_key" {
  description = "Firebase Web API キー (秘密情報ではないが環境ごとに異なる)"
  type        = string
  default     = ""
}

variable "firebase_auth_domain" {
  description = "Firebase Authentication のドメイン (例: PROJECT_ID.firebaseapp.com)"
  type        = string
  default     = ""
}

variable "firebase_app_id" {
  description = "Firebase Web アプリの App ID"
  type        = string
  default     = ""
}

variable "firebase_messaging_sender_id" {
  description = "Firebase Cloud Messaging の Sender ID"
  type        = string
  default     = ""
}

variable "media_retention_days" {
  description = <<-EOT
    削除済みオブジェクトのバージョンを保持する日数。
    0 にするとライフサイクルルールを作らない。
  EOT
  type        = number
  default     = 30
}
