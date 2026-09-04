# =============================================================================
# Secret Manager
# =============================================================================
# 秘密情報の「入れ物」だけを Terraform で作り、中身 (バージョン) は
# gcloud または コンソールから登録する。
# 中身を Terraform で管理すると tfstate に平文で残ってしまうため。
#
#   echo -n "実際の値" | gcloud secrets versions add LINE_CHANNEL_ACCESS_TOKEN \
#     --data-file=- --project=PROJECT_ID
# =============================================================================

locals {
  secret_ids = [
    "LINE_CHANNEL_SECRET",
    "LINE_CHANNEL_ACCESS_TOKEN",
  ]
}

resource "google_secret_manager_secret" "app" {
  for_each = toset(local.secret_ids)

  project   = var.project_id
  secret_id = each.value

  replication {
    # 東京リージョンに固定する (データの所在地を明示できる)
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.required]
}

# アプリ用サービスアカウントには「このシークレットだけ」読み取りを許可する。
# プロジェクト全体の secretmanager.secretAccessor は付けない。
resource "google_secret_manager_secret_iam_member" "app_accessor" {
  for_each = google_secret_manager_secret.app

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}
