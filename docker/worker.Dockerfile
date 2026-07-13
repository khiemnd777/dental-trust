# syntax=docker/dockerfile:1.7

FROM node:22.23.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=dental-trust-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm exec turbo run build --filter=@dental-trust/worker...

FROM base AS runtime
ARG BUILD_DATE=unknown
ARG VCS_REF=unknown
ARG VERSION=development
ARG SOURCE_URL=unknown
LABEL org.opencontainers.image.title="DENTAL TRUST Worker" \
      org.opencontainers.image.description="DENTAL TRUST background job worker" \
      org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.source=$SOURCE_URL
ENV NODE_ENV=production
ENV BUILD_VERSION=$VERSION
ENV WORKER_HEALTH_PORT=4001
COPY --from=build --chown=node:node /workspace /workspace
USER node
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/worker/dist/main.js"]
