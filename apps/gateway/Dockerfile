# Build stage - compile TypeScript and generate artifacts
FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache protobuf-dev && \
  npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

COPY libs/common/src/protos ./libs/common/src/protos
RUN mkdir -p libs/common/src/generated && \
  pnpm run proto:generate || echo "Proto generation failed - some proto files may be missing"

COPY . .

RUN pnpm run build gateway

# Development stage - self-contained with all dev tools
FROM node:lts-alpine AS development
WORKDIR /app

RUN apk add --no-cache protobuf-dev && \
  npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules

USER root
EXPOSE 3000

# Production stage - minimal and optimized
FROM node:lts-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init && \
  npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --prod --frozen-lockfile --ignore-scripts

RUN npm uninstall -g pnpm && \
  addgroup -g 1001 -S nodejs && \
  adduser -S nestjs -u 1001

COPY --chown=nestjs:nodejs --from=builder /app/dist/apps/gateway ./dist/apps/gateway
COPY --chown=nestjs:nodejs --from=builder /app/libs/common/src/protos ./libs/common/src/protos

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

CMD ["dumb-init", "node", "dist/apps/gateway/main"]
