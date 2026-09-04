# =============================================================================
# Cloud Firestore
# =============================================================================
# 注意:
#   - 1 プロジェクトにつきデータベースは 1 つ (default) が基本。
#   - 作成後にロケーションは変更できない。慎重に選ぶこと。
#   - すでに Firebase コンソールから作成済みの場合は、
#     `terraform import google_firestore_database.default "(default)"` で取り込むか、
#     このファイルを削除して手動管理にする。
# =============================================================================

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # 誤って terraform destroy でデータベースごと消さないための保険
  delete_protection_state = "DELETE_PROTECTION_ENABLED"

  # Point-in-time recovery。過去 7 日間の任意の時点に復元できる。
  # 家族の家計データを守るために有効化しておく (少額の追加料金あり)。
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"

  depends_on = [google_project_service.required]

  lifecycle {
    prevent_destroy = true
  }
}

# Security Rules とインデックスは firebase CLI (firebase.json) で管理する。
# Terraform でも書けるが、ルールの反復開発はエミュレータ + firebase deploy の方が速い。
