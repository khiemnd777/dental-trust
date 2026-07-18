# Deployment

## Release model

Web, API, and worker are independently runnable, non-root containers built from one immutable Git commit. PostgreSQL, Redis, private S3-compatible storage, email, Stripe, malware scanning, telemetry, and error tracking are managed production dependencies. `docker-compose.yml` is for local development, not a production orchestrator.

## Required configuration

Populate the exact variables validated by `@dental-trust/config`: `NODE_ENV=production`, `PORT`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`, authentication issuer/audience/secret, field-encryption key, S3 endpoint/region/bucket/access credentials/path style, ClamAV host/port, SMTP host/port/from plus `SMTP_SECURE=true` and username/password, `PAYMENT_ADAPTER=stripe`, Stripe secret/webhook signing secret, a URL-restricted Mapbox public access token, and optional paired SMS/messaging, OTel, and error-tracking endpoints/credentials. Public Next.js variables are build-time inputs.

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

Orchestration checks the API/web liveness endpoint and uses readiness for traffic admission. Worker health includes Redis connectivity and heartbeat/queue age. On `SIGTERM`, HTTP processes stop accepting new requests, complete in-flight work within the platform grace period, and close connections. Workers stop claiming jobs, complete or safely release current leases, then exit.

## Rollback

- Roll back web/API/worker to the previous image digest when the migration remains backward-compatible.
- Do not reverse destructive migrations under traffic. Disable the affected feature, deploy a forward fix, or invoke the approved restore procedure.
- If integrity/confidentiality may be affected, pause sensitive mutations, preserve evidence, and follow [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).
- After rollback, reconcile webhooks/jobs created during the failed release and document any manual correction with audit references.

## Production hardening

Use TLS everywhere, private network access to datastores, restrictive security groups, non-root/read-only containers where feasible, temporary writable directories, resource limits, autoscaling/queue alarms, WAF/rate controls, multi-AZ PostgreSQL, Redis durability appropriate to queues, object versioning/lifecycle, encrypted backups, and protected deployment environments with review.
