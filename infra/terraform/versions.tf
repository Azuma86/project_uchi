terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # 学習用のため既定ではローカルの tfstate を使う。
  # 複数人・複数環境で使うなら GCS バックエンドへ切り替えること
  # (tfstate には機微な情報が入るので Git にコミットしないこと)。
  #
  # backend "gcs" {
  #   bucket = "uchi-plus-tfstate"
  #   prefix = "uchi-plus"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
