#!/bin/sh
# ローカル開発をこれ 1 つで立ち上げる。
#
#   npm run dev:local
#
# やること:
#   1. Firebase Emulator (Auth / Firestore / Storage) を起動
#   2. 起動を待つ
#   3. 初回のみシードデータを投入 (--seed を付けると毎回投入)
#   4. Next.js の開発サーバーを起動
#
# Ctrl+C で両方まとめて終了する。

set -e
cd "$(dirname "$0")/.."

FORCE_SEED=0
[ "$1" = "--seed" ] && FORCE_SEED=1

# ---------------------------------------------------------------------------
# .env.local が無ければ用意する
# ---------------------------------------------------------------------------
if [ ! -f .env.local ]; then
  echo "→ .env.local が無いので .env.example から作成します"
  cp .env.example .env.local
fi

# ---------------------------------------------------------------------------
# ポートが空いているか確認する
# ---------------------------------------------------------------------------
for port in 9099 8080 9199 3000; do
  if lsof -ti "tcp:$port" >/dev/null 2>&1; then
    echo "エラー: ポート $port がすでに使用されています。" >&2
    echo "        既存のプロセスを終了してから再実行してください:" >&2
    echo "        lsof -ti tcp:$port | xargs kill" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# エミュレータを起動する
# ---------------------------------------------------------------------------
echo "→ Firebase Emulator を起動しています..."
mkdir -p .emulator-data
sh scripts/with-emulators.sh start > .emulator-data/emulators.log 2>&1 &
EMULATOR_PID=$!

cleanup() {
  echo ""
  echo "→ 終了しています..."
  kill "$EMULATOR_PID" 2>/dev/null || true
  wait "$EMULATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 起動を待つ (最大 90 秒)
waited=0
while :; do
  if curl -s -o /dev/null "http://127.0.0.1:8080" \
    && curl -s -o /dev/null "http://127.0.0.1:9099" \
    && curl -s -o /dev/null "http://127.0.0.1:9199"; then
    break
  fi
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo "エラー: エミュレータの起動に失敗しました。ログ: .emulator-data/emulators.log" >&2
    tail -20 .emulator-data/emulators.log >&2
    exit 1
  fi
  waited=$((waited + 1))
  if [ "$waited" -gt 90 ]; then
    echo "エラー: エミュレータの起動がタイムアウトしました。" >&2
    exit 1
  fi
  sleep 1
done
echo "  エミュレータ起動完了 (UI: http://127.0.0.1:4000)"

# ---------------------------------------------------------------------------
# シードデータ
# ---------------------------------------------------------------------------
SEED_MARKER=.emulator-data/.seeded
if [ "$FORCE_SEED" = "1" ] || [ ! -f "$SEED_MARKER" ]; then
  echo "→ シードデータを投入しています..."
  npm run --silent seed
  touch "$SEED_MARKER"
else
  echo "  シード済みのデータを再利用します (再投入するには npm run dev:local -- --seed)"
fi

# ---------------------------------------------------------------------------
# 開発サーバー
# ---------------------------------------------------------------------------
cat <<'BANNER'

  ────────────────────────────────────────────────
   UCHI+ ローカル開発環境

   アプリ          http://localhost:3000
   Emulator UI     http://127.0.0.1:4000

   ログイン (パスワードはすべて password123)
     おとうさん  dad@example.com   admin
     おかあさん  mom@example.com   admin
     はなこ      kid@example.com   member

   招待コード      YAMADA2026

   Ctrl+C で両方まとめて終了します
  ────────────────────────────────────────────────

BANNER

npm run --silent dev
