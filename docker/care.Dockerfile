# syntax=docker/dockerfile:1.7
FROM node:26.5.0-bookworm-slim AS base
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
ARG NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    PUBLIC_APP_URL=$PUBLIC_APP_URL \
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=$NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
COPY . .
RUN pnpm exec turbo run build --filter=@dental-trust/care...
FROM node:26.5.0-bookworm-slim AS runtime
ARG VERSION=development
LABEL org.opencontainers.image.title="DENTAL TRUST Care" org.opencontainers.image.version=$VERSION
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/apps/care/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/care/.next/static ./apps/care/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node","apps/care/server.js"]
