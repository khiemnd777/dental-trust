# Deployment

## Release model

Web, API, and worker are independently runnable, non-root containers built from one immutable Git commit. PostgreSQL, Redis, private S3-compatible storage, email, Stripe, malware scanning, telemetry, and error tracking are managed production dependencies. `docker-compose.yml` is for local development, not a production orchestrator.

## Required configuration

Populate the exact variables validated by `@dental-trust/config`: `NODE_ENV=production`, `PORT`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`, authentication issuer/audience/secret, field-encryption key, S3 endpoint/region/bucket/access credentials/path style, ClamAV host/port, SMTP host/port/from plus `SMTP_SECURE=true` and username/password, `PAYMENT_ADAPTER=stripe`, Stripe secret/webhook signing secret, a URL-restricted Mapbox public access token, and optional paired SMS/messaging, OTel, and error-tracking endpoints/credentials. Public Next.js variables are build-time inputs.

Set the initial upload/scan abuse budgets explicitly in production: `UPLOAD_MAX_ACTIVE_PER_USER=5`, `UPLOAD_MAX_BYTES_PER_USER_WINDOW=5368709120`, `UPLOAD_QUOTA_WINDOW_SECONDS=86400`, `FILE_SCAN_CONCURRENCY=2`, `FILE_SCAN_MAX_JOBS_PER_MINUTE=20`, `FILE_SCAN_DEADLINE_MILLISECONDS=120000`, `FILE_SCAN_MAX_QUEUED_JOBS=500`, `UPLOAD_QUARANTINE_MAX_AGE_SECONDS=1800`, `CARE_AUTH_VERIFY_CONCURRENCY=8`, and `CARE_MULTIPART_CONCURRENCY=2`. Treat changes as capacity/security changes: baseline object storage, ClamAV, Redis, worker memory, and queue age before raising them. File scanning uses the dedicated `file-processing` queue; do not route it back through `domain-events`. Completed scan jobs retain at most 2,000 entries for six hours, and failed scan jobs at most 2,000 entries for three days. Outbox delivery state remains authoritative in PostgreSQL: BullMQ retention is diagnostic, and a missing or exhausted job is reconciled from the database or moved to durable dead letter.

Run `node scripts/verify-env.mjs` in the release environment without printing values. Store secrets in the platform secret manager, not image layers, CI logs, manifests, or `.env` artifacts.

## Build

```bash
docker build --file docker/web.Dockerfile --tag dental-trust-web:${GIT_SHA} .
docker build --file docker/api.Dockerfile --tag dental-trust-api:${GIT_SHA} .
docker build --file docker/worker.Dockerfile --tag dental-trust-worker:${GIT_SHA} .
```

CI publishes immutable commit tags only after all quality gates. Record build version/commit in image metadata and the health/version response. Scan images and generate provenance/SBOM in the deployment platform where supported.

The GitHub `production-images` environment must define `PRODUCTION_APP_URL` and the versioned `PRODUCTION_PUBLIC_API_URL` as HTTPS repository/environment variables. The release workflow fails before publishing the web image when either is missing or insecure.

## Release sequence

1. Verify the approved commit, tests, dependency/secret scans, image digest, and configuration preflight.
2. Create/verify a restorable database snapshot and confirm backup recency.
3. Run committed backward-compatible migrations once using a dedicated release job and `pnpm db:migrate:deploy`.
4. Deploy API and worker revision with no user traffic until readiness passes.
5. Deploy web revision using the matching public origins/build version.
6. Shift traffic gradually; check liveness/readiness, version, logs, queue age, error/latency rates, and dependency health.
7. Run smoke tests: public profile, login, scoped case read, upload quarantine, test notification in a non-production account, and a provider-health view that performs no real payment.
8. Monitor through the rollback window and record the release/audit evidence.

## Health and graceful shutdown

Orchestration checks each service independently: the API and each BFF use their own liveness/readiness endpoint, while the worker reports Redis connectivity and heartbeat/queue age. BFF readiness validates only local startup configuration and must not call API deep readiness; this prevents one platform probe from multiplying PostgreSQL, Redis, or object-store probes. Restrict deep API/worker readiness and all metrics to the orchestration/monitoring network. On `SIGTERM`, HTTP processes stop accepting new requests, complete in-flight work within the platform grace period, and close connections. Workers stop claiming jobs, complete or safely release current leases, then exit.

## Edge and origin contract

All Internet-facing hostnames require a CDN/reverse proxy with managed DDoS and WAF controls before production. The provider is replaceable, but the boundary contract is not:

- terminate public TLS at the approved edge and re-encrypt traffic to the origin;
- allow origin ingress only from the edge/load-balancer network and the deployment health network—DNS secrecy is not a control;
- remove client-supplied forwarding/identity headers, then set the canonical client address and request ID at the trusted hop;
- configure the application/load balancer with the exact proxy hop count or trusted proxy CIDRs; never trust arbitrary `X-Forwarded-For` input;
- configure `BFF_TRUSTED_CLIENT_IP_HEADER` as a single-value header that the edge deletes and overwrites, and set the same high-entropy `BFF_CLIENT_CONTEXT_SECRET` on API and BFF instances without exposing it to browser bundles;
- enforce connection, header, body, idle, and upstream timeouts before request-body parsing; require `Content-Length` on bounded JSON/multipart routes where supported;
- apply route policies separately for static/public reads, authentication, telemetry, AI/audio, uploads, and signed provider webhooks;
- cache only explicitly public reads, never authenticated, health-detail, telemetry, webhook, or mutation responses;
- preserve signed webhook bodies byte-for-byte and allow provider sources/signatures without bypassing origin lockdown.

Store the edge policy as reviewed deployment configuration. This repository's application guards are defense in depth and do not replace a shared edge or Redis-backed distributed limiter.

The API accepts per-client limiter identity only from a short-lived HMAC assertion created by a BFF. Invalid, stale, unsigned, or comma-separated forwarding input falls back to a network bucket. A second Redis budget is keyed globally by ingress IP rather than controller route, so rotating routes cannot escape `RATE_LIMIT_NETWORK_PER_MINUTE`. Redis limiter failure returns the stable fail-closed response `503 RATE_LIMIT_STORAGE_UNAVAILABLE`; public-read fail-open remains disabled until a separately bounded edge/cache policy is validated.

## Rollback

- Roll back web/API/worker to the previous image digest when the migration remains backward-compatible.
- Do not reverse destructive migrations under traffic. Disable the affected feature, deploy a forward fix, or invoke the approved restore procedure.
- If integrity/confidentiality may be affected, pause sensitive mutations, preserve evidence, and follow [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).
- After rollback, reconcile webhooks/jobs created during the failed release and document any manual correction with audit references.

## Production hardening

Use TLS everywhere, private network access to datastores, restrictive security groups, non-root/read-only containers where feasible, temporary writable directories, resource limits, autoscaling/queue alarms, WAF/rate controls, multi-AZ PostgreSQL, Redis durability appropriate to queues, object versioning/lifecycle, encrypted backups, and protected deployment environments with review. Configure an object-store lifecycle rule that expires objects tagged `state=quarantined` after the approved forensic window; never use a prefix-only `quarantine/` expiry because clean clinical objects retain that prefix and are promoted by changing their tag to `state=clean`. The worker reconciler is the primary cleanup path, while the tag-filtered lifecycle rule bounds storage growth if the application or database is unavailable. Allow and preserve the signed `x-amz-tagging` upload header at storage CORS/proxy boundaries. Per-user quotas do not replace global bucket/account capacity alerts or tenant-level budgets.

## DDoS-safe rollout

1. Establish staging baselines with the bounded scripts in `load-tests/`; retain the results with the release evidence.
2. Deploy dashboards and alerts for edge blocks, `429`, origin RPS, p95/p99, event-loop delay, memory, database pool pressure, queue age, and provider spend.
3. Run new WAF/rate rules in count/log mode for 24–48 hours and review false positives by route family, not by sensitive payload.
4. Lock down the origin, verify that direct-origin requests fail, and independently probe each internal readiness endpoint.
5. Canary application limits and edge enforcement at 10%, 50%, then 100%; stop on SLO regression or legitimate `403`/`429` growth.
6. Enable high-cost policies last (authentication, AI/audio, upload, payment) with explicit user/tenant and global concurrency budgets.
7. Roll back the changed edge policy or application revision independently. Do not disable origin lockdown as a rollback shortcut.
