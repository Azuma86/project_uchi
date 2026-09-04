# =============================================================================
# Artifact Registry — Docker イメージの保管場所
# =============================================================================
# Container Registry (gcr.io) の後継。
# リージョンを選べる / IAM で細かく制御できる / 脆弱性スキャンに対応する。
# =============================================================================

resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = var.service_name
  description   = "UCHI+ のコンテナイメージ"
  format        = "DOCKER"

  # 古いイメージを自動削除して保存料金を抑える。
  # 家族アプリなら直近数世代あれば十分 (ロールバック用)。
  cleanup_policies {
    id     = "keep-recent-releases"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old-images"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 日
    }
  }

  depends_on = [google_project_service.required]
}
