# =============================================================================
# UCHI+ — Cloud Run 用 Dockerfile
# =============================================================================
#
# multi-stage build にしている理由:
#   最終イメージに「実行に必要なものだけ」を入れるため。
#   ソースコード・devDependencies・ビルドキャッシュを含めないことで
#     - イメージが小さくなる (Artifact Registry の保存料金が下がる)
#     - Cloud Run のコールドスタートが速くなる (イメージの取得が速い)
#     - 攻撃対象が減る (コンパイラやテストツールが本番に無い)
#
# Next.js の output: 'standalone' により、必要な node_modules だけが
# .next/standalone にまとめられる (next.config.ts を参照)。
# =============================================================================

# -----------------------------------------------------------------------------
# 1) 依存関係のインストール
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# package.json と lock ファイルだけ先にコピーする。
# ソースを変更しても、依存が変わらなければこの層のキャッシュが再利用される。
COPY package.json package-lock.json ./
RUN npm ci

# -----------------------------------------------------------------------------
# 2) ビルド
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# テレメトリを無効化 (Cloud Run 上から外部への不要な通信を減らす)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# 重要: このアプリは NEXT_PUBLIC_* を使わないため、
# ビルド時に Firebase の設定値を渡す必要がない。
# 同じイメージを dev / staging / prod で使い回せる。
RUN npm run build

# -----------------------------------------------------------------------------
# 3) 実行
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run はコンテナに PORT 環境変数を渡す。既定は 8080。
ENV PORT=8080
# 0.0.0.0 で待ち受けないと Cloud Run からリクエストが届かない
ENV HOSTNAME=0.0.0.0

# root で動かさない (コンテナが乗っ取られた場合の被害を小さくする)
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone 出力に含まれないものだけ個別にコピーする
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

# ヘルスチェック (Cloud Run 自体は HTTP で判定するが、ローカル検証用に持たせる)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
