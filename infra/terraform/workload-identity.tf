# =============================================================================
# Workload Identity Federation — GitHub Actions から鍵ファイル無しで GCP を操作する
# =============================================================================
#
# 仕組み:
#   1. GitHub Actions が「このワークフローは owner/repo の main ブランチである」
#      という内容の OIDC トークンを発行する
#   2. GCP の Workload Identity Pool がそのトークンを検証する
#   3. 条件に合致すれば、デプロイ用サービスアカウントの
#      短命なアクセストークン (1 時間程度) が発行される
#
# サービスアカウントの鍵ファイル (JSON) を作らないので、
# 「鍵の漏洩」「鍵のローテーション忘れ」という問題が原理的に発生しない。
# =============================================================================

resource "google_iam_workload_identity_pool" "github" {
  count = var.github_repository == "" ? 0 : 1

  project                   = var.project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
  description               = "GitHub Actions からのデプロイ用"

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = var.github_repository == "" ? 0 : 1

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  # GitHub のトークンに含まれる情報を GCP 側の属性へ対応付ける
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # 【重要】この条件が無いと、世界中のどの GitHub リポジトリからでも
  # このプロバイダを使えてしまう。必ずリポジトリを固定する。
  attribute_condition = "attribute.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# 「このリポジトリの main ブランチ」だけがデプロイ用 SA を借りられる
resource "google_service_account_iam_member" "github_impersonation" {
  count = var.github_repository == "" ? 0 : 1

  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member = join("", [
    "principalSet://iam.googleapis.com/",
    google_iam_workload_identity_pool.github[0].name,
    "/attribute.repository/",
    var.github_repository,
  ])
}
