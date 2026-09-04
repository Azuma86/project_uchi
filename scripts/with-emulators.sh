#!/bin/sh
# Firebase Emulator が必要なコマンドを実行するためのラッパー。
# JDK 21+ を自動的に探して JAVA_HOME を設定してから firebase コマンドを呼ぶ。
#
#   使い方: sh scripts/with-emulators.sh start
#           sh scripts/with-emulators.sh exec "vitest run --project rules"

set -e
cd "$(dirname "$0")/.."

JAVA_HOME_FOUND=$(sh scripts/find-java.sh) || true

if [ -z "$JAVA_HOME_FOUND" ]; then
  cat >&2 <<'MSG'

  Firebase Emulator の実行には JDK 21 以上が必要です。

    macOS (Homebrew):
      brew install openjdk@21

    インストール済みなのに見つからない場合は、JAVA_HOME を指定してください:
      JAVA_HOME=/path/to/jdk21 npm run <command>

MSG
  exit 1
fi

export JAVA_HOME="$JAVA_HOME_FOUND"
export PATH="$JAVA_HOME/bin:$PATH"

PROJECT="${FIREBASE_PROJECT:-uchi-plus-demo}"
MODE="$1"
shift

case "$MODE" in
  start)
    exec npx firebase emulators:start \
      --only auth,firestore,storage \
      --project "$PROJECT" \
      --import ./.emulator-data --export-on-exit ./.emulator-data
    ;;
  exec)
    exec npx firebase emulators:exec \
      --only auth,firestore,storage \
      --project "$PROJECT" \
      "$@"
    ;;
  *)
    echo "usage: $0 {start|exec} [command]" >&2
    exit 2
    ;;
esac
