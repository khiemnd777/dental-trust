# Operations runbook

## Service map and indicators

| Service        | Critical dependencies                    | Primary indicators                                                          |
| -------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Web            | API, build assets                        | request error/latency, LCP/INP/CLS, client errors, version                  |
| API            | PostgreSQL, Redis, S3, provider adapters | readiness, 5xx/latency, DB pool, auth denials, webhook failures             |
| Worker         | Redis, PostgreSQL, S3, email/scanner     | heartbeat, queue depth/oldest age, retry/dead-letter count, provider errors |
| PostgreSQL     | storage/replication/backups              | connections, locks, slow queries, replication/PITR and backup age           |
| Redis/BullMQ   | memory/persistence                       | memory/evictions, connectivity, stalled jobs, queue age                     |
| Object/scanner | S3/ClamAV                                | health, upload/scan latency, quarantine backlog, signed-link failures       |

Logs are structured JSON in production and queried by service, version, environment, request/correlation ID, safe actor/tenant IDs, job ID, or provider event ID. Never search by copying sensitive payloads into an unapproved system.

The API exposes liveness at `/api/v1/health/live`, readiness at `/api/v1/health/ready`, and bounded Prometheus text metrics at `/api/v1/health/metrics`. The worker exposes the equivalent `/health/live`, `/health/ready`, and `/metrics` endpoints on its internal health port. Restrict readiness and metrics ingress to the platform/monitoring network. HTTP metrics normalize UUIDs and numeric path segments; queue metrics use only bounded queue/outcome labels. Neither surface contains user, tenant, document, message, or provider payload data.

When `OTEL_EXPORTER_OTLP_ENDPOINT` is configured, the API continues or creates a W3C trace and exports an OTLP JSON server span to `/v1/traces`. Trace export is bounded to two seconds and never changes the HTTP result. `ERROR_TRACKING_DSN` receives only error type, a generic non-sensitive message, request/trace IDs, normalized error code, and coarse route. Validate collector retention and access before enabling either adapter.

Client route failures are reported to the same-origin `/api/telemetry/client-error` endpoint. The event intentionally contains only a validated framework digest and a coarse locale/area route family; browser error messages, stack traces, query strings, resource identifiers, and form data are never submitted. Search structured logs for `event=client_route_error` and correlate by `eventId` and `digest`.

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

**Upload scan backlog:** preserve quarantine, check scanner definitions/health and object connectivity, scale scanner safely, and communicate delay. Do not release unscanned objects.

**Email outage:** keep durable delivery attempts, honor retry/backoff/provider quotas, display in-app status for critical coordination, and switch adapter only after domain/DKIM/SPF/DMARC and privacy approval.

## Maintenance

- Announce scope, user impact, UTC window, owner, rollback trigger, and status channel.
- Verify backup and migration/restore plan before database changes.
- Pause/coordinate workers for incompatible queue/schema changes.
- Afterward verify version/readiness, critical smoke flows, queues/webhooks, audit events, and error/latency baselines.

## Escalation

Escalate immediately for suspected data leakage, unauthorized privilege, payment inconsistency, lost encryption material, destructive migration, inability to restore, or user-safety risk. Follow [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), not ad hoc production edits.
