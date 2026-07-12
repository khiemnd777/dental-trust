# Trust and safety workflows

This slice provides controlled workflow state, not clinical advice, emergency dispatch, legal adjudication, or automatic privacy compliance. Urgent patient copy must direct users to local emergency care outside this API.

## Incident and warranty boundary

- Only the owning patient can submit an incident or warranty claim; impersonation cannot submit one.
- Warranty clinic and terms are copied from the completed platform booking and immutable plan version.
- Free-form details are AES-256-GCM envelopes bound to the incident ID. Audit/outbox payloads contain identifiers and classification only.
- Attachments must already be clean, available case documents. A database trigger rejects cross-case or unscanned attachments.
- List/detail queries are patient, assignment, or active-tenant scoped and select only patient-visible events.
- Triage assigns severity, SLA, and an eligible case owner with optimistic concurrency. Close requires management capability and MFA; the patient owner or manager may reopen according to the state machine.
- Incident timeline events and audit records are append-only.

## Reviews

- Application policy and a PostgreSQL trigger independently verify patient ownership, completed case state, completed platform booking, and clinic attribution before a review can be `verified=true`.
- One initial review is allowed per patient/case. Publication remains pending until moderation.
- A clinic response requires active staff membership in the reviewed clinic and has its own moderation status.
- Abuse-report details are encrypted. Moderators need `review:moderate`, current MFA, and a non-impersonated session; hiding/rejecting a review actions its open reports.

## Privacy requests

Implemented states are `SUBMITTED`, `IDENTITY_VERIFICATION_REQUIRED`, `IN_REVIEW`, `APPROVED`, `PROCESSING`, `COMPLETED`, `REJECTED`, and `CANCELLED`. Only explicit transitions are allowed. Admin processing requires `privacy:manage`, current MFA, a version match, and a patient-visible message. Request reason and patient message are encrypted with request-specific associated data.

Approval creates a one-per-request execution record with verified identity evidence and a bounded worker lease. Export execution builds a deterministic machine-readable ZIP, verifies every included private object's size and SHA-256 digest while streaming, stores the archive privately with an expiry, and exposes only a fresh owner-authorized signed download. The hourly purge job deletes expired artifacts and appends purge evidence. Deletion execution requires a delivered bilingual warning, revokes active credentials and shares, evaluates active care, financial, trust/safety, professional-membership, and legal-hold constraints, then either deidentifies the account or records a retained-legal-hold outcome. Every category disposition, blocker, retry, completion, and purge is audited.

Production still requires an approved jurisdiction-specific category retention schedule, legal-hold operating procedure, provider/subprocessor discovery, backup-tombstone propagation, and object-storage/email-provider integration certification. The API never fabricates an export link or reports deletion before immutable execution evidence exists.

## Support elevation

An elevation is a database grant, not a second session or shared credential. A platform/super administrator with current MFA approves an active support agent, active subject, ticket reference, reason, capability set, and expiry of at most 120 minutes. Every elevated request rechecks the grant and records subject plus impersonator in the audit log. Revocation and expiry fail closed.

The browser must render the `GET /auth/me` impersonation object persistently while elevated and send `X-Support-Elevation-Id` only for an explicitly selected support action. That production UI is not yet implemented.
