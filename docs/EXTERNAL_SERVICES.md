# External services

All providers sit behind adapters. Local/test adapters are safe and explicit; they cannot simulate production success when required production configuration is absent.

| Capability         | Local/test                                                | Production requirement                                                                                                                         | Sensitive configuration                                                                          |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PostgreSQL         | Compose PostgreSQL                                        | Managed PostgreSQL with TLS, HA, PITR, encrypted backups                                                                                       | `DATABASE_URL`, `DIRECT_DATABASE_URL`                                                            |
| Queue/cache        | Compose Redis                                             | Private TLS Redis compatible with BullMQ and chosen durability                                                                                 | `REDIS_URL`                                                                                      |
| Private files      | Compose MinIO                                             | Private S3-compatible bucket, encryption/versioning/lifecycle/CORS                                                                             | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` |
| Malware scan       | Compose ClamAV                                            | ClamAV or approved managed scanner with fail-closed availability                                                                               | `CLAMAV_HOST`, `CLAMAV_PORT`                                                                     |
| Email              | Mailpit over local SMTP                                   | TLS SMTP from a transactional provider with verified domain, DKIM/SPF/DMARC, bounce/suppression operations                                     | `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`           |
| Payment            | Development/test adapter                                  | Stripe live account, approved products/currencies/refund process, signed webhook endpoint                                                      | `PAYMENT_ADAPTER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                           |
| Clinic map         | Mapbox when configured; OpenStreetMap continuity fallback | Mapbox account and billing, URL- and scope-restricted public token, approved style, quota/budget monitoring; contracted fallback tile provider | `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`                                                                |
| Clinic payouts     | Development adapter                                       | Stripe Connect Express account onboarding and an approved payout/compliance operating model                                                    | Uses `PAYMENT_ADAPTER=stripe`, `STRIPE_SECRET_KEY`, `APP_URL`                                    |
| Calendar status    | Development adapter                                       | Approved authenticated HTTPS synchronization service with provider OAuth/secrets isolated from Dental Trust                                    | `CALENDAR_ADAPTER=external`, `CALENDAR_PROVIDER_URL`, `CALENDAR_PROVIDER_TOKEN`                  |
| Telemetry          | W3C trace context + local Prometheus metrics; export off  | Approved OTLP/HTTP JSON collector with data minimization, internal metrics scraping, and retention                                             | `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                    |
| Error tracking     | Redacted local structured event; external delivery off    | Approved HTTPS event endpoint/project with access control, source-map protection, retention, and PII scrubbing                                 | `ERROR_TRACKING_DSN`                                                                             |
| SMS/messaging      | Disabled                                                  | Optional approved HTTPS provider and consent/template review                                                                                   | `SMS_PROVIDER_URL`, `SMS_PROVIDER_TOKEN`, `MESSAGING_PROVIDER_URL`, `MESSAGING_PROVIDER_TOKEN`   |
| Video consultation | Local-only generated link                                 | Approved manually provisioned HTTPS link on an explicit provider-host allowlist                                                                | `MEETING_ADAPTER=manual`, `MEETING_ALLOWED_HOSTS=meet.provider.example`                          |
| Passport PDF       | Deterministic PDFKit renderer with bundled OFL Noto Sans  | Bundled renderer and font in the immutable image, or an approved authenticated HTTPS renderer with bounded PDF responses                       | `PASSPORT_PDF_ADAPTER`, `PASSPORT_PDF_SERVICE_URL`, `PASSPORT_PDF_SERVICE_TOKEN`                 |

## Provider acceptance checklist

- Security/privacy and data-processing review, hosting/transfer location, subprocessors, retention/deletion, breach terms, and least-privilege account ownership.
- Separate development/staging/production projects and credentials; rotation/revocation procedure and named owner.
- Timeouts, retry/backoff, idempotency, circuit breaking, rate/cost limits, health metrics, and outage behavior.
- Webhook signature verification, replay policy, IP controls where useful, event retention, and reconciliation.
- No medical details in email/SMS subjects, analytics, telemetry, or support metadata.
- Contract tests against sandbox and a production-readiness test that does not create false clinical/payment events.

The meeting adapter does not provision video-provider meetings. In production it accepts only a manually provisioned HTTPS URL whose exact hostname is allowlisted, encrypts that URL before persistence, and fails closed if required input/configuration is absent.

Clinic payout onboarding uses Stripe Connect Express when the Stripe adapter is selected. Account creation and onboarding-link requests use provider idempotency keys, return/refresh URLs must match the configured application origin, and the stored provider account reference is encrypted. The development adapter is prohibited in production. A live Connect account, platform/payout ownership, terms, supported-country/currency review, and provider-backed acceptance tests remain deployment requirements.

The Care clinic map loads Mapbox GL JS with the Mapbox Standard style, Vietnamese labels,
provider attribution, client-side clinic clustering, trust markers, and the user's live position.
The browser token is intentionally public but must be restricted to approved HTTPS URLs and only
the minimum scopes required for styles and tiles. Use a separate token per environment and set
quota/billing alerts. `NEXT_PUBLIC_` variables are embedded at build time, so rotate or change the
token by rebuilding the Care artifact. If Mapbox is unavailable, Care falls back to an
OpenStreetMap tile layer so clinic discovery, trust markers, and user location remain usable. The
fallback is intended for continuity; production traffic should use a tile provider with an
appropriate usage policy and SLA.

The calendar adapter sends only a Dental Trust connection ID, clinic/dentist IDs, provider label, opaque external calendar reference during connection, and an idempotency key to an authenticated HTTPS service. Dental Trust stores only a SHA-256 hash of the external calendar reference plus bounded connection status/error metadata. Production startup rejects the development adapter, missing credentials, or a non-HTTPS service URL. This contract currently synchronizes connection health only; it does not import external busy windows into Dental Trust availability, verify provider webhooks, or reconcile deletions. Those capabilities require an approved provider-service extension and integration/E2E certification before external calendar state can be claimed as scheduling evidence.

The built-in passport renderer produces deterministic A4 PDF bytes from a validated provider-authored manifest, embeds the repository-pinned full Vietnamese-capable Noto Sans font, and fails if that runtime asset is absent. The external adapter is optional; when selected it requires both an authenticated HTTPS endpoint and credential, a 15-second timeout, `application/pdf`, a bounded response, and valid PDF magic. Missing or malformed external capability fails closed. Generated PDFs are written to the private object bucket with server-side encryption and content checksum metadata; object storage does not authorize a user or share request.

The worker has a durable notification relay and bounded BullMQ retry/dead-letter behavior. It renders localized, medical-detail-free email copy, decrypts verification/reset tokens only in worker memory, suppresses expired links, and sends through authenticated implicit-TLS SMTP in production. Optional SMS/messaging adapters use authenticated HTTPS requests and idempotency keys. Provider bounce webhooks, complaint handling, sending-domain certification, and provider-backed acceptance tests remain production onboarding requirements.

Privacy exports stream directly from PostgreSQL and private object storage into a server-side-encrypted private ZIP object. Source objects are accepted only when their persisted byte length and SHA-256 digest match during streaming; partial multipart uploads are aborted, total size is bounded, and expired export objects are purged by the worker. Production requires bucket lifecycle monitoring, provider-side encryption/key policy review, and object-storage integration tests. Account deletion does not claim erasure from third-party providers or backups until those approved adapters and tombstone procedures are configured.

Production credentials are intentionally not present in the repository. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
