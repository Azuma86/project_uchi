output "cloud_run_url" {
  description = "Cloud Run の URL。APP_URL や Firebase の承認済みドメインに設定する。"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repository" {
  description = "docker push 先のパス"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "media_bucket" {
  description = "写真・領収書を保存する Cloud Storage バケット (GCS_BUCKET に設定)"
  value       = google_storage_bucket.media.name
}

output "app_service_account" {
  description = "Cloud Run が使うサービスアカウント (RUNTIME_SERVICE_ACCOUNT に設定)"
  value       = google_service_account.app.email
}

output "deployer_service_account" {
  description = "GitHub Actions が借りるサービスアカウント (WIF_SERVICE_ACCOUNT に設定)"
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "GitHub Actions の WIF_PROVIDER に設定する値"
  value = length(google_iam_workload_identity_pool_provider.github) > 0 ? google_iam_workload_identity_pool_provider.github[0].name : "(github_repository 変数が未設定のため作成されていません)"
}

output "github_secrets_checklist" {
  description = "GitHub Actions のリポジトリ Secrets に登録する値の一覧"
  value = {
    GCP_PROJECT_ID          = var.project_id
    GCS_BUCKET              = google_storage_bucket.media.name
    RUNTIME_SERVICE_ACCOUNT = google_service_account.app.email
    WIF_SERVICE_ACCOUNT     = google_service_account.deployer.email
    APP_URL                 = google_cloud_run_v2_service.app.uri
  }
}
