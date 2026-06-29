# Stage 1: Prune workspace dependencies using Turborepo
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=web --docker

# Stage 2: Install dependencies and build the application
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable Corepack for Yarn v4 package manager
RUN corepack enable && corepack prepare yarn@4.16.0 --activate

# Copy pruned workspace manifests and lockfile
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/yarn.lock ./yarn.lock
COPY .yarnrc.yml ./
COPY .yarn/ ./.yarn/

# Install packages with immutable rules
RUN yarn install --immutable

# Copy pruned source code
COPY --from=pruner /app/out/full/ ./
COPY turbo.json ./

# Enable standalone output for Docker builds
ENV DOCKER_BUILD=true

# Set Sentry release from git SHA for error tracking correlation
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
ENV NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}

# Compile packages and build the Next.js app in standalone mode
RUN npx turbo build --filter=web...

# Stage 3: Runner container for serverless deployment
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

# Leverage trace files to copy minimal standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "apps/web/server.js"]
