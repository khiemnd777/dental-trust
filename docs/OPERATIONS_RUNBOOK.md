# Operations runbook

## Service map and indicators

| Service        | Critical dependencies                    | Primary indicators                                                          |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Web            | API, build assets                        | request error/latency, LCP/INP/CLS, client errors, version                  |
| API            | PostgreSQL, Redis, S3, provider adapters | readiness, 5xx/latency, DB pool, auth denials, webhook failures             |
| Worker         | Redis, PostgreSQL, S3, email/scanner     | heartbeat, queue depth/oldest age, retry/dead-letter count, provider errors |
| PostgreSQL     | storage/replication/backups              | connections, locks, slow queries, replication/PITR and backup age           |
| Redis/BullMQ   | memory/persistence                       | memory/evictions, connectivity, stalled jobs, queue age by queue            |
| Object/scanner | S3/ClamAV, `file-processing` queue       | health, upload/scan latency, quarantine backlog, signed-link failures       |

Logs are structured JSON in production and queried by service, version, environment, request/correlation ID, safe actor/tenant IDs, job ID, or provider event ID. Never search by copying sensitive payloads into an unapproved system.

The API exposes liveness at `/api/v1/health/live`, readiness at `/api/v1/health/ready`, and bounded Prometheus text metrics at `/api/v1/health/metrics`. The worker exposes the equivalent `/health/live`, `/health/ready`, and `/metrics` endpoints on its internal health port. Restrict readiness and metrics ingress to the platform/monitoring network. HTTP metrics normalize UUIDs and numeric path segments; queue metrics use only bounded queue/outcome labels. Neither surface contains user, tenant, document, message, or provider payload data.

When `OTEL_EXPORTER_OTLP_ENDPOINT` is configured, the API continues or creates a W3C trace and exports an OTLP JSON server span to `/v1/traces`. Trace export is bounded to two seconds and never changes the HTTP result. `ERROR_TRACKING_DSN` receives only error type, a generic non-sensitive message, request/trace IDs, normalized error code, and coarse route. Validate collector retention and access before enabling either adapter.

Client route failures are reported to the same-origin `/api/telemetry/client-error` endpoint. The event intentionally contains only a validated framework digest and a coarse locale/area route family; browser error messages, stack traces, query strings, resource identifiers, and form data are never submitted. Search structured logs for `event=client_route_error` and correlate by `eventId` and `digest`. Telemetry routes require bounded request bodies and have a fixed-size per-process emergency budget. That budget protects one process from log/export amplification but is not a distributed rate limiter; edge policy remains authoritative.

## Daily checks

- Production versions match the approved release and all instances are ready.
- Error rate/latency and security-denial anomalies remain within the agreed baseline.
- Failed webhooks/jobs have owners; oldest queue age and quarantine backlog stay within SLA.
- Database storage, connection pool, replication, backup/PITR age, object capacity, and certificate expiry are healthy.
- Verification expiry, aftercare escalation, incident/warranty, privacy-request, and support-elevation queues have no overdue unassigned work.
- Appointment (24-hour and 2-hour), aftercare (daily then weekly), and failed-payment reminder jobs are advancing without duplicate notification keys.

## Triage patterns

**API not ready:** identify the failing dependency from the safe health response and logs; compare recent release/config; verify PostgreSQL/Redis/S3 connectivity from the service network. Roll back code/config when safe—do not mark readiness green manually.

**Database saturation:** inspect pool usage, long-running queries/locks, recent endpoints/migrations, and unbounded/N+1 patterns. Rate-limit the offending path, cancel only verified safe queries, then fix/query-index and load test.

**Queue backlog:** identify queue/job type, oldest age, retry reason, consumer heartbeat, and provider limits. Scale only idempotent consumers; quarantine poison jobs; replay in bounded batches.

**Failed webhook:** verify signature-result metrics, provider delivery history, stored unique event ID, and current payment state. Replay through the signed provider facility or controlled internal reprocessor; never edit payment success directly.

**Upload scan backlog:** preserve quarantine, check scanner definitions/health, object connectivity, and the dedicated `file-processing` queue. The initial policy is five active uploads and 5 GiB per user per 24 hours, with worker concurrency two, at most 20 scans per minute, a 120-second absolute scan deadline, and at most 500 queued scans. Raise these budgets only after confirming ClamAV, object storage, Redis, and worker-memory headroom; do not move scans to `domain-events`. On retry exhaustion the asset becomes `REJECTED/ERROR`, the outbox event is durably dead-lettered, and the active-upload slot is released. The scheduled reconciler claims and deletes abandoned quarantines and terminal scan errors after 30 minutes; alert on `DELETION_PENDING`, verify the object-store lifecycle filters on tag `state=quarantined` (never the shared `quarantine/` prefix alone), and monitor global bucket plus tenant capacity because per-user limits alone cannot bound aggregate abuse. Completed jobs are retained for six hours/2,000 entries and failed jobs for three days/2,000 entries; PostgreSQL outbox state remains the replay authority. Do not release unscanned objects.

**Email outage:** keep durable delivery attempts, honor retry/backoff/provider quotas, display in-app status for critical coordination, and switch adapter only after domain/DKIM/SPF/DMARC and privacy approval.

## DDoS and abuse response

Trigger this procedure for abnormal edge/origin RPS, connection growth, sustained `429`, event-loop or memory pressure, dependency saturation, queue growth, or unexpected provider spend:

1. Declare an incident, preserve edge/origin/limiter metrics, record UTC start time and affected route families, and separate volumetric traffic from an application-layer hot path.
2. Confirm traffic reaches only the edge. If direct origin access is possible, repair firewall/security-group allowlists immediately without publishing the origin address.
3. Enable the pre-reviewed emergency edge policy for the narrowest affected route family. Prefer challenge/drop at the edge; do not send blocked traffic to the application for logging.
4. Protect authentication, AI/audio, uploads, telemetry, and expensive public searches with route-specific and global budgets. Do not apply an emergency rule to payment/provider webhooks until signature and provider-delivery impact is verified.
5. Keep liveness cheap. Do not increase deep-readiness frequency; API/worker readiness and metrics remain internal. Scale only after edge filtering and when PostgreSQL/Redis/queue headroom supports it.
6. Verify legitimate flows from at least two networks and monitor `403`/`429`, 5xx, latency, memory, DB pool, queue age, and provider cost. Roll back the specific rule if false positives exceed the incident threshold.
7. After stabilization, remove temporary rules through review, reconcile missed webhooks/jobs, retain a redacted incident timeline, and convert observed traffic into a controlled staging regression scenario.

Emergency changes must have an owner, expiry, rollback condition, and audit/change reference. Never solve overload by making readiness static-green, exposing internal health details, disabling authentication, or bypassing signed webhook verification.

## Maintenance

- Announce scope, user impact, UTC window, owner, rollback trigger, and status channel.
- Verify backup and migration/restore plan before database changes.
- Pause/coordinate workers for incompatible queue/schema changes.
- Afterward verify version/readiness, critical smoke flows, queues/webhooks, audit events, and error/latency baselines.

## Escalation

Escalate immediately for suspected data leakage, unauthorized privilege, payment inconsistency, lost encryption material, destructive migration, inability to restore, or user-safety risk. Follow [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), not ad hoc production edits.
