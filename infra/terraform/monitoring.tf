# =============================================================================
# Cloud Monitoring — 最低限のアラート
# =============================================================================
# 家族アプリなので凝った監視は不要だが、
#   「壊れているのに気付かない」
#   「知らないうちに課金が膨らむ」
# の 2 つだけは避けたい。
#
# 通知先 (notification channel) はメールアドレスをコンソールで登録するのが
# 手軽なため、ここでは Terraform 管理から外している。
# 作成後、コンソールでアラートポリシーに通知チャネルを紐付けること。
# =============================================================================

# 5xx エラーが増えたら気付けるようにする
resource "google_monitoring_alert_policy" "cloud_run_errors" {
  project      = var.project_id
  display_name = "UCHI+ Cloud Run 5xx エラー率"
  combiner     = "OR"

  conditions {
    display_name = "5xx が 5 分間で 5 件以上"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "resource.labels.service_name = \"${var.service_name}\"",
        "metric.type = \"run.googleapis.com/request_count\"",
        "metric.labels.response_code_class = \"5xx\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  # 障害が続いても通知は 1 時間に 1 回まで
  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content = <<-EOT
      UCHI+ でサーバーエラーが増えています。

      確認手順:
      1. Cloud Logging で severity>=ERROR のログを確認
         resource.type="cloud_run_revision" severity>=ERROR
      2. 直前のデプロイが原因なら、Cloud Run のリビジョンを戻す
         gcloud run services update-traffic ${var.service_name} --to-revisions=<前のリビジョン>=100
    EOT
  }

  depends_on = [google_project_service.required]
}

# インスタンス数が想定外に増えたら課金が膨らむ兆候
resource "google_monitoring_alert_policy" "cloud_run_instances" {
  project      = var.project_id
  display_name = "UCHI+ Cloud Run インスタンス数の異常"
  combiner     = "OR"

  conditions {
    display_name = "インスタンス数が 2 を超える状態が 10 分継続"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "resource.labels.service_name = \"${var.service_name}\"",
        "metric.type = \"run.googleapis.com/container/instance_count\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "600s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  documentation {
    content = <<-EOT
      家族数人の利用では通常 1 インスタンスで足ります。
      増えている場合は、外部からのクロールや不正アクセスの可能性があります。
      Cloud Logging でアクセス元を確認してください。
    EOT
  }

  depends_on = [google_project_service.required]
}
