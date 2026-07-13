# syntax=docker/dockerfile:1.7
FROM node:22.23.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /workspace
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=dental-trust-pnpm,target=/pnpm/store pnpm install --frozen-lockfile
FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG PUBLIC_APP_URL=http://localhost:3003
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL PUBLIC_APP_URL=$PUBLIC_APP_URL
COPY . .
RUN pnpm exec turbo run build --filter=@dental-trust/provider...
FROM node:22.23.1-bookworm-slim AS runtime
ARG VERSION=development
LABEL org.opencontainers.image.title="DENTAL TRUST Provider" org.opencontainers.image.version=$VERSION
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/apps/provider/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/provider/.next/static ./apps/provider/.next/static
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:3001/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node","apps/provider/server.js"]
