# Security architecture

## Status boundary

This document distinguishes implemented controls from controls required before production. The repository is not approved for production clinical or payment data; unresolved controls are tracked in [Known limitations](KNOWN_LIMITATIONS.md).

## Implemented controls

### Identity and sessions

- Passwords use Argon2id with explicit memory, time, and parallelism costs.
- Browser sessions use random opaque tokens, persist only token hashes, expire, and can be listed/revoked.
- Production cookies are `Secure`, `HttpOnly`, and same-site. Cookie-authenticated mutations enforce configured origin plus a double-submit CSRF token; bearer-authenticated calls are not treated as cookie requests.
- Repeated failed logins are recorded and locked accounts are denied without exposing whether an account exists.
- New sessions for an MFA-enrolled account are limited to session bootstrap, MFA verification, and logout until the current session completes its challenge. Privileged routes additionally require an MFA-verified access context. Development seed identities receive an explicit local-only MFA state; production has no bypass and therefore fails closed.
- Email-verification and password-reset secrets are hashed for lookup, encrypted in outbox payloads, expiry-bound, single-use, and supersede prior unconsumed tokens. Reset consumption revokes every active session.
- TOTP seeds are encrypted with context-bound authenticated encryption. Re-enrollment keeps the current factor active until confirmation; recovery codes are display-once, secret-keyed hashes consumed atomically.

### Application and API

- Shared Zod schemas validate implemented transport inputs.
- Case and file access checks combine role, permission, active membership, selected tenant, ownership/assignment, and caregiver grants at request time.
- Repository queries scope tenant resources; out-of-scope resource reads are concealed.
- Helmet, restrictive CORS, CSP, request IDs, throttling, structured errors, `private, no-store` responses, and safe logging are enabled.
- BFF readiness is locally evaluated and does not fan out into deep dependency probes. Client telemetry checks a bounded declared body and a fixed-size, per-process emergency budget before session I/O. Audio multipart requests require a declared bounded length, pass through a bounded whole-flow concurrency gate, and verify the session and Care role before parsing; the API retains its 10 MiB file limit.
- BFFs create short-lived HMAC client-context assertions from a single edge-overwritten IP header. The API never trusts raw client identity headers, rejects stale/tampered assertions, uses per-client route budgets for fairness, and enforces a second Redis-backed global ingress-IP ceiling across routes.
- Case mutations use state policies, optimistic versions, transactions, and stored-response idempotency.
- Audit, history, acceptance, consent, and selected snapshot records have database append-only/immutability enforcement.
- Public directory queries require current verified evidence and licenses at read time. Contact PII is encrypted before persistence and excluded from outbox metadata.
- Appointment access reloads case ownership, caregiver grants, selected organization membership, and active case assignment. Clinical visits also require an active same-clinic location. UTC windows are versioned; recurring availability, leave/block windows, notice/advance policy, capacity, and same-dentist/same-case overlap are rechecked by PostgreSQL constraints/triggers during writes. Production meeting links require an explicit HTTPS provider-host allowlist and are encrypted before persistence.
- Clinic operations require an active selected tenant plus the matching active clinic-staff record and named capability. Business contacts, payout account references, team invitation email/token material, case-decision reasons, and availability-block reasons use context-bound authenticated encryption or secret hashes. Immutable price versions preserve the published service/warranty snapshot and integer minor-unit price bounds.
- Case message subjects, bodies, and internal notes use context-bound authenticated encryption. Attachments must be `CLEAN` plus `AVAILABLE` case documents. Read receipts are participant scoped, while internal notes have separate tables/endpoints and assigned-staff-only policy. Content is excluded from logs, audit/outbox metadata, and idempotency responses.
- Journey/passport reads require patient ownership or an active selected-clinic assignment. Clinic writes require current MFA and role-specific capability; provider-authored instructions and passport clinical fields use context-bound authenticated encryption. Immutable plan-change evidence and patient-session acknowledgement are enforced in PostgreSQL.
- Passport manifests use deterministic SHA-256 checksums and previous-version links. Generated bilingual PDFs stay in private object storage. Patient share URLs contain only an opaque credential; persistence keeps only its hash, access is expiry/revocation/count bounded, denial states are concealed, and known-token access outcomes store no raw IP, user agent, case, or clinical text.

### Private files

- Upload initiation authorizes the patient case or selected clinic tenant and issues a short-lived signed PUT for an opaque quarantine key in a private bucket.
- Finalization checks object size, then a worker streams the object through SHA-256, file-signature detection, declared/detected MIME comparison, and ClamAV.
- Only `AVAILABLE` plus `CLEAN` files receive short-lived signed downloads after a fresh authorization check. Clinic onboarding cannot attach evidence until the scan is clean. Rejected/infected/indeterminate files fail closed.

### Configuration and supply chain

- Only `.env.example` is committed. Production validation rejects development secrets/credentials/endpoints, HTTP application origins, non-live Stripe keys, absent Stripe signing material, a non-Stripe payment adapter, or a non-HTTPS/development calendar synchronization adapter.
- Dependency versions and the package-manager version are pinned; the lockfile is installed frozen in CI.
- CI declares formatting, placeholder scanning, lint, type checking, unit/integration/E2E jobs, builds, dependency audit, secret scanning, and container builds. A declared job is not evidence that the current branch has passed it; actual verification status belongs in the handoff.
- Dockerfiles use multi-stage builds and non-root runtime users. Image content/minimization and production startup still require successful container-gate execution.

## Required before production

The following controls are designed or partially scaffolded but not complete:

- an approved provider-backed email delivery processor for the implemented verification/reset outbox intents, plus invitation delivery;
- broader MFA step-up policy coverage, factor reset governance, session rotation after elevation, and WebAuthn/passkey support;
- a mature maintained authentication library and a tested migration from the first-party session implementation;
- comprehensive application-level encryption/decryption and key rotation for the clinical field inventory;
- operator review and notification delivery around implemented support elevation;
- provider-backed meeting provisioning plus external-calendar busy-window ingestion, webhook verification, and reconciliation;
- audit coverage for every sensitive view/export, verification decision, payment/refund, privacy action, and administrative change;
- production telemetry exporters, alerting, secret redaction verification, encrypted backup/PITR, and restore exercises;
- complete rate/body limits and abuse controls for every future endpoint;
- an approved CDN/WAF and managed DDoS service, origin firewall lockdown, trusted forwarding-header contract, and shared distributed limits validated against production-like load;

## Security verification

Threats and mitigations are tracked in [THREAT_MODEL.md](THREAT_MODEL.md). Security reporting is in the root [SECURITY.md](../SECURITY.md), incident handling is in [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), and release blockers are in [Known limitations](KNOWN_LIMITATIONS.md).

Data handling levels, inventories, transfer rules, and retention/export constraints are defined in [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md).
