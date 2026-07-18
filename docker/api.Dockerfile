# syntax=docker/dockerfile:1.7

FROM node:26.5.0-bookworm-slim AS base
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
RUN pnpm exec turbo run build --filter=@dental-trust/api...

FROM base AS runtime
ARG BUILD_DATE=unknown
ARG VCS_REF=unknown
ARG VERSION=development
ARG SOURCE_URL=unknown
LABEL org.opencontainers.image.title="DENTAL TRUST API" \
      org.opencontainers.image.description="DENTAL TRUST secure HTTP API" \
      org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.source=$SOURCE_URL
ENV NODE_ENV=production
ENV PORT=4000
ENV BUILD_VERSION=$VERSION
COPY --from=build --chown=node:node /workspace /workspace
USER node
EXPOSE 4000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]
