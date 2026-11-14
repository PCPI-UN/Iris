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

RUN cd apps/project-service && npx prisma generate && cd ../.. && \
  pnpm run build project-service

# Development stage - self-contained with all dev tools
FROM node:lts-alpine AS development
WORKDIR /app

RUN apk add --no-cache protobuf-dev && \
  npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules

USER root
EXPOSE 50055

# Production stage - minimal and optimized
FROM node:lts-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init openssl && \
  npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=builder /app/apps/project-service/prisma ./apps/project-service/prisma

RUN npm install -g prisma@6.16.2 && \
  prisma generate --schema=./apps/project-service/prisma/schema.prisma && \
  npm uninstall -g pnpm && \
  npm cache clean --force && \
  rm -rf /root/.npm && \
  addgroup -g 1001 -S nodejs && \
  adduser -S nestjs -u 1001

COPY --chown=nestjs:nodejs --from=builder /app/dist/apps/project-service ./dist/apps/project-service
COPY --chown=nestjs:nodejs --from=builder /app/libs/common/src/protos ./libs/common/src/protos

USER nestjs
EXPOSE 50055

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('net').createConnection({port:50055}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["dumb-init", "node", "dist/apps/project-service/main"]