# Threat model

## Scope and method

This model covers browser/PWA, web server, API, worker/queue, PostgreSQL, Redis, private object storage, email, payment webhooks, telemetry, administrative operations, CI/CD, and backups. It uses STRIDE-style review with special focus on medical privacy and cross-tenant access.

## Assets and trust boundaries

High-value assets are credentials/session material, patient identity and medical records, caregiver consent, verification evidence/decisions, treatment plans, payment/refund state, signed file URLs, audit history, encryption keys, provider credentials, backups, and deployment authority.

Trust boundaries exist at browser-to-web/API, API-to-datastores/providers, provider-to-webhook, API-to-worker queue, clinic/patient/operations tenant boundaries, and CI-to-production deployment.

## Prioritized threats

| Threat                                   | Primary controls                                                                                                     | Residual action                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cross-tenant IDOR or query leakage       | Scoped repositories, deny-by-default policies, opaque IDs, concealed not-found responses, two-tenant negative tests  | Continuous authorization regression coverage and production access anomaly alerts |
| Caregiver/clinic access after revocation | Current grant/assignment lookup on sensitive requests, short sessions/signed URLs, cache invalidation, audit         | Verify propagation targets and alert on post-revocation attempts                  |
| Support/admin abuse                      | Capability-based RBAC, MFA, time-bound approved elevation, visible impersonation, append-only audit                  | Periodic access review and dual control for exports/refunds                       |
| Account takeover/recovery abuse          | Argon2id, MFA for privileged users, non-enumerating recovery, hashed one-use tokens, rate limits, session rotation   | Add risk-based detection and compromised-password screening provider              |
| Malicious/private upload                 | Quarantine, extension/MIME/magic-byte/size checks, malware scan, random keys, private bucket, authorized signed URLs | Harden content viewers and isolate document conversion                            |
| Payment spoofing/replay                  | Raw-body signature verification, clock tolerance, unique provider event ID, idempotent transaction, reconciliation   | Alert on signature failure spikes and unresolved events                           |
| Treatment-plan or verification tampering | Immutable versions, reviewer separation, evidence provenance/hash, state machine, audit                              | Periodic integrity review and signed exports where required                       |
| Sensitive data in logs/telemetry         | Structured allow-list logging, redaction, provider filters, no payload/body logging                                  | Automated secret/PII canaries and sample review                                   |
| Queue replay/poison jobs                 | Stable dedupe keys, idempotent handlers, bounded retry/backoff, dead-letter inspection, least-privilege workers      | Runbooks and per-job SLA alerts                                                   |
| Injection/XSS/CSRF/SSRF                  | Runtime validation, parameterized ORM, output encoding/CSP, secure cookies/origin checks, provider URL allow-lists   | DAST and targeted SSRF tests before production                                    |
| Dependency/build compromise              | Frozen lockfile, audit, secret scan, pinned actions/images, least-privilege CI, immutable artifacts/SBOM target      | Signature/provenance verification and dependency review cadence                   |
| Backup or key compromise                 | Encryption, separate access boundary, rotation, immutable retention, restore logging                                 | Cross-account copy and recovery exercise                                          |
| Denial of service/cost exhaustion        | Rate/body/query limits, bounded pagination, queue quotas, timeouts/circuit breaking, autoscaling metrics             | Capacity tests and tenant/provider spend alerts                                   |

## Abuse cases requiring tests

- Guess another tenant's case, nested plan, message, file, or review ID.
- Reuse an expired/revoked caregiver link or previously issued signed object URL.
- Submit a payment-success redirect without a valid webhook, replay a valid webhook, or mutate its body.
- Upload executable/polyglot/oversized content or download before a clean scan.
- Modify an accepted plan version or acknowledge a version belonging to another case.
- Publish a verification badge after evidence expiry/revocation or approve one's own clinic submission.
- Use a content/finance/verification role to read unrelated medical data.
- Continue impersonation after elevation expiry or omit an elevation reason.
- Inject CR/LF, tokens, medical content, or object links into log fields.

## Review cadence

Review before each production launch, new provider, material authorization/data-flow change, and at least quarterly. Security defects are tracked privately; critical/high issues block release.
