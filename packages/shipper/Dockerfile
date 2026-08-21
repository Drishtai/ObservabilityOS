# Lightweight Node.js Alpine base image
FROM node:22-alpine AS builder

WORKDIR /app

# Copy monorepo configurations and packages
COPY package.json turbo.json ./
COPY packages/typescript-config packages/typescript-config
COPY packages/sdk packages/sdk
COPY packages/shipper packages/shipper

# Install dependencies and build shipper
RUN corepack enable && yarn set version 4.16.0
RUN yarn install
RUN yarn turbo run build --filter=@observability-os/shipper...

# Production runtime image (less than 100MB)
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/shipper/dist ./dist
COPY --from=builder /app/packages/shipper/package.json ./package.json
COPY --from=builder /app/packages/sdk/dist ./node_modules/@observability-os/sdk/dist
COPY --from=builder /app/packages/sdk/package.json ./node_modules/@observability-os/sdk/package.json

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--stdin", "--enable-metrics"]
