# =============================================================================
# Cloud Storage — 写真と領収書の保存先
# =============================================================================

resource "google_storage_bucket" "media" {
  name     = "${var.project_id}-media"
  project  = var.project_id
  location = var.region

  # 【最重要】均一なバケットレベルアクセスを有効にする。
  # これにより「オブジェクトごとの ACL」が無効になり、
  # うっかり公開設定にしてしまう事故を防げる。
  uniform_bucket_level_access = true

  # 公開アクセスを構成レベルで禁止する
  public_access_prevention = "enforced"

  # 家族の写真は取り出し頻度が読めないため STANDARD。
  # (NEARLINE などは保存料が安い代わりに取り出し料と最低保存期間がある)
  storage_class = "STANDARD"

  # 誤削除からの復旧用にバージョニングを有効化する。
  # 古いバージョンにも保存料がかかるので、ライフサイクルで自動削除する。
  versioning {
    enabled = true
  }

  dynamic "lifecycle_rule" {
    for_each = var.media_retention_days > 0 ? [1] : []
    content {
      condition {
        days_since_noncurrent_time = var.media_retention_days
      }
      action {
        type = "Delete"
      }
    }
  }

  # 中断したアップロードの残骸を消す (見えないまま課金され続けるのを防ぐ)
  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  # ブラウザから署名付き URL へ直接 PUT / GET するために CORS が必要。
  # 許可するオリジンはアプリの URL だけに絞る。
  cors {
    origin          = compact([var.app_url, "http://localhost:3000"])
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.required]
}

# アプリ用サービスアカウントには「このバケットに対してのみ」権限を与える。
# プロジェクト全体の storage.admin は付けない。
resource "google_storage_bucket_iam_member" "app_object_admin" {
  bucket = google_storage_bucket.media.name
  # objectAdmin = 作成・読み取り・削除。写真の削除機能があるため必要。
  # 読み取りだけなら objectViewer、作成だけなら objectCreator を使う。
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}
