# =============================================================================
# サービスアカウントと IAM
# =============================================================================
# 方針: 用途ごとにサービスアカウントを分け、必要最小限のロールだけ付ける。
#
#   1. アプリ実行用 (Cloud Run)  … 実行中のアプリが使う権限
#   2. デプロイ用 (GitHub Actions) … CI がイメージを push してデプロイする権限
#
# 分ける理由: アプリが乗っ取られてもデプロイはできない / CI が漏れても
# 家族のデータは読めない、という具合に被害範囲を切り分けられる。
#
# Editor / Owner は絶対に付けない。これらはプロジェクト内のほぼ全操作を
# 許可してしまい、「最小権限」の考え方から最も遠い。
# =============================================================================

# -----------------------------------------------------------------------------
# 1) アプリ実行用サービスアカウント
# -----------------------------------------------------------------------------
resource "google_service_account" "app" {
  account_id   = "${var.service_name}-run"
  display_name = "UCHI+ Cloud Run runtime"
  description  = "Cloud Run 上のアプリが使うサービスアカウント (最小権限)"
  project      = var.project_id

  depends_on = [google_project_service.required]
}

locals {
  # プロジェクトレベルで付与するロール
  app_project_roles = [
    # Firestore の読み書き。datastore.owner ではなく user (インデックス管理などは不可)
    "roles/datastore.user",
    # Cloud Logging へ構造化ログを書く
    "roles/logging.logWriter",
    # Cloud Monitoring へカスタム指標を書く (将来用)
    "roles/monitoring.metricWriter",
    # Firebase Authentication のセッション Cookie 発行・ユーザー参照。
    # session cookie の作成に対応する細かい定義済みロールが無いためこれを使う。
    # さらに絞りたい場合はカスタムロールを検討する。
    "roles/firebaseauth.admin",
  ]
}

resource "google_project_iam_member" "app_roles" {
  for_each = toset(local.app_project_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app.email}"
}

# 署名付き URL を作るために「自分自身の鍵で署名する」権限が要る。
# ADC には秘密鍵が無いので、IAM Credentials API の signBlob を使う。
resource "google_service_account_iam_member" "app_token_creator" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.app.email}"
}

# -----------------------------------------------------------------------------
# 2) デプロイ用サービスアカウント (GitHub Actions が借りる)
# -----------------------------------------------------------------------------
resource "google_service_account" "deployer" {
  account_id   = "${var.service_name}-deployer"
  display_name = "UCHI+ GitHub Actions deployer"
  description  = "CI からのビルド・デプロイ専用。家族データへのアクセス権は持たない。"
  project      = var.project_id

  depends_on = [google_project_service.required]
}

locals {
  deployer_project_roles = [
    "roles/artifactregistry.writer", # イメージの push
    "roles/run.admin",               # Cloud Run サービスの更新
    "roles/firebaserules.admin",     # Security Rules のデプロイ
    "roles/datastore.indexAdmin",    # Firestore インデックスのデプロイ
  ]
}

resource "google_project_iam_member" "deployer_roles" {
  for_each = toset(local.deployer_project_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Cloud Run のリビジョンをアプリ用 SA で動かすには
# 「そのサービスアカウントとして動かす権限」が別途必要。
resource "google_service_account_iam_member" "deployer_act_as_app" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
