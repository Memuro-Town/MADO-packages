# ── base: 共通イメージ ──
FROM node:20-alpine AS base
# Prisma のクエリエンジンが必要とする共有ライブラリ
RUN apk add --no-cache libc6-compat openssl

# ── deps: 依存パッケージのインストール ──
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# lockfile どおりに再現性のあるインストールを行う（npm install ではなく npm ci）
RUN npm ci

# ── builder: Prismaクライアント生成 + Next.jsビルド ──
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── runner: 本番用の軽量イメージ ──
# next.config.ts の output: "standalone" が生成する最小構成のみを配置する。
# node_modules を丸ごと持ち込まないためイメージサイズが大幅に小さくなる。
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# standalone の server.js は HOSTNAME / PORT を参照する
ENV HOSTNAME=0.0.0.0
ENV PORT=3010

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone 出力（server.js + トレースされた最小の node_modules）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# standalone には含まれない静的アセットを補う
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma のクエリエンジンはトレースから漏れることがあるため明示的に配置する
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma/client ./node_modules/.prisma/client
# スキーマ（マイグレーション・運用時の参照用）
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma

# ── 職員アカウント管理CLI ──
# standalone の依存トレースは Next.js のアプリコードから辿られるため、
# 独立したCLIスクリプトとその依存は出力に含まれない。
# scripts/*.mjs は @prisma/client と bcryptjs を実行時に import するが、
#   - @prisma/client / .prisma/client … 上でコピー済み（アプリ側で外部化されるため standalone に含まれる）
#   - bcryptjs … アプリ側ではサーバチャンクにバンドルされてしまい node_modules に残らない
# ため、bcryptjs だけ明示的に配置する必要がある（純JS・依存なし・約136KB）。
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

USER nextjs
EXPOSE 3010

CMD ["node", "server.js"]
