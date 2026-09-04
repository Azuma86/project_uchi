# =============================================================================
# 有効化する API
# =============================================================================
# GCP は「使う API を明示的に有効化する」方式。
# 有効化していない API を呼ぶと 403 (SERVICE_DISABLED) になる。
# 有効化自体に料金はかからない。
# =============================================================================

locals {
  required_apis = [
    "run.googleapis.com",              # Cloud Run — アプリの実行環境
    "artifactregistry.googleapis.com", # Artifact Registry — Docker イメージ置き場
    "firestore.googleapis.com",        # Cloud Firestore — データベース
    "firebase.googleapis.com",         # Firebase — Auth などの管理
    "identitytoolkit.googleapis.com",  # Firebase Authentication の実体
    "storage.googleapis.com",          # Cloud Storage — 写真・領収書
    "secretmanager.googleapis.com",    # Secret Manager — 秘密情報
    "iamcredentials.googleapis.com",   # 署名付き URL の生成 (signBlob) に必要
    "logging.googleapis.com",          # Cloud Logging
    "monitoring.googleapis.com",       # Cloud Monitoring
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "sts.googleapis.com", # Workload Identity Federation のトークン交換
  ]
}

resource "google_project_service" "required" {
  for_each = toset(local.required_apis)

  project = var.project_id
  service = each.value

  # terraform destroy で API を無効化しない (他のリソースが壊れるため)
  disable_on_destroy = false
}
