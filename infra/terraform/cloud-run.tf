# =============================================================================
# Cloud Run — アプリの実行環境
# =============================================================================

resource "google_cloud_run_v2_service" "app" {
  project  = var.project_id
  name     = var.service_name
  location = var.region

  # 外部からの HTTPS アクセスを受ける。
  # アプリ自体の認証は Firebase Authentication が行う。
  ingress = "INGRESS_TRAFFIC_ALL"

  # Cloud Run の IAM 認証はかけない (= 誰でも URL を開ける)。
  # 下部の google_cloud_run_v2_service_iam_member で allUsers に
  # run.invoker を付与している。家族以外が開いてもログイン画面しか見えない。
  # IAM 認証にすると Google アカウントの ID トークンが必須になり、
  # スマホのブラウザから普通に使うことができなくなる。

  template {
    service_account = google_service_account.app.email

    scaling {
      # 【コストの要】0 にするとリクエストが無い間はインスタンスが落ちる。
      # 家族数人の利用なら、ほとんどの時間が課金ゼロになる。
      # 代償として久しぶりのアクセスで数秒待たされる (コールドスタート)。
      min_instance_count = 0
      # 暴走・DDoS 時の課金上限。家族利用なら 3 で十分すぎる。
      max_instance_count = 3
    }

    # 1 インスタンスが同時に捌くリクエスト数。
    # Next.js はイベントループで捌けるので大きめでよい。
    # 大きいほどインスタンス数が減り安くなる。
    max_instance_request_concurrency = 80

    timeout = "60s"

    containers {
      image = var.container_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # 【コストの要】false = リクエスト処理中だけ CPU を使う。
        # true (CPU always allocated) にすると待機中も課金される。
        # バックグラウンド処理が無いこのアプリでは false でよい。
        cpu_idle = true
        # コールドスタート時だけ CPU を増やして起動を速くする。
        # 起動時間が短くなる分、体感が良くなる (追加料金は僅少)。
        startup_cpu_boost = true
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.media.name
      }
      env {
        name  = "APP_URL"
        value = var.app_url
      }
      env {
        name  = "FIREBASE_API_KEY"
        value = var.firebase_api_key
      }
      env {
        name  = "FIREBASE_AUTH_DOMAIN"
        value = var.firebase_auth_domain
      }
      env {
        name  = "FIREBASE_APP_ID"
        value = var.firebase_app_id
      }
      env {
        name  = "FIREBASE_MESSAGING_SENDER_ID"
        value = var.firebase_messaging_sender_id
      }
      env {
        name  = "NOTIFICATION_DRIVER"
        value = "console"
      }
      env {
        name  = "OCR_DRIVER"
        value = "dummy"
      }
      env {
        name  = "LOG_LEVEL"
        value = "info"
      }

      # 秘密情報は値ではなく「Secret Manager への参照」として渡す。
      # こうするとリビジョンの設定にも tfstate にも平文が残らない。
      dynamic "env" {
        for_each = google_secret_manager_secret.app
        content {
          name = env.value.secret_id
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 3
        period_seconds        = 5
        failure_threshold     = 6
        timeout_seconds       = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    # イメージは GitHub Actions が更新するので Terraform では差分を無視する。
    # (無視しないと terraform apply のたびに古いイメージへ戻ってしまう)
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.app_accessor,
  ]
}

# 未認証アクセスを許可する (アプリ側で Firebase Auth によるログインを要求する)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
