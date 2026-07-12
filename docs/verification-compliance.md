# Verification and compliance

The verification subsystem treats a public badge as a projection of current, reviewer-approved evidence. A clinic or dentist cannot write a verified projection directly.

## Lifecycle and evidence

Cases use the statuses `NOT_SUBMITTED`, `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `ADDITIONAL_INFORMATION_REQUIRED`, `SITE_AUDIT_REQUIRED`, `APPROVED`, `VERIFIED`, `VERIFICATION_EXPIRING`, `EXPIRED`, `SUSPENDED`, and `REJECTED`. New persisted cases always start at `DRAFT`, version 1.

Versioned bilingual templates materialize a checklist when a case is created. Clinic checklists contain all 15 required evidence categories; dentist checklists contain practice license, scope of practice, and active clinic affiliation. Evidence must have a clean, available file owned by its submitter or an attributable source reference. Public claims require every required checklist item to be approved and backed by approved, non-revoked, non-expired evidence.

High-risk transitions to `VERIFIED` or `SUSPENDED`, including reinstatement from suspension, create a pending review. A different authorized user must apply the second approval. The applicant, primary reviewer, and second approver are attributable; the primary and second reviewer cannot be the same person.

## API routes

All routes require an authenticated session. Privileged requests require an MFA-verified session. Every mutation requires `X-Idempotency-Key` and uses optimistic versions.

| Method | Route                                                     | Purpose                                                                             |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET`  | `/verification/templates`                                 | Read the active bilingual checklist templates.                                      |
| `GET`  | `/verification/cases`                                     | Read a bounded, cursor-paginated queue. Filters: subject, status, assignee, expiry. |
| `POST` | `/verification/cases`                                     | Create or reuse the applicant's active clinic or dentist case.                      |
| `GET`  | `/verification/cases/:caseId`                             | Read a scoped case workspace and complete history.                                  |
| `POST` | `/verification/cases/:caseId/assign`                      | Assign an eligible verification reviewer.                                           |
| `POST` | `/verification/cases/:caseId/evidence`                    | Add evidence to a specific materialized requirement.                                |
| `POST` | `/verification/cases/:caseId/submit`                      | Submit a complete applicant checklist.                                              |
| `POST` | `/verification/cases/:caseId/evidence/:evidenceId/review` | Approve, reject, or revoke evidence.                                                |
| `POST` | `/verification/cases/:caseId/decisions`                   | Propose or apply a reasoned case transition.                                        |
| `POST` | `/verification/reviews/:reviewId/second-approval`         | Independently approve or reject a high-risk decision.                               |
| `POST` | `/verification/cases/:caseId/site-audits`                 | Schedule a scoped clinic site audit.                                                |
| `GET`  | `/verification/site-audits/:siteAuditId`                  | Read the containing audit workspace.                                                |
| `POST` | `/verification/site-audits/:siteAuditId/complete`         | Complete the checklist with encrypted findings and clean attachments.               |
| `POST` | `/verification/cases/:caseId/corrective-actions`          | Request a corrective action.                                                        |
| `GET`  | `/verification/corrective-actions/:actionId`              | Read the containing corrective-action workspace.                                    |
| `POST` | `/verification/corrective-actions/:actionId/respond`      | Submit an applicant response and clean attachments.                                 |
| `POST` | `/verification/corrective-actions/:actionId/decision`     | Accept, reject, or close corrective evidence.                                       |

The response envelope uses `data` and `requestId`. List responses additionally use `page: { nextCursor, count }`. Case summaries expose subject identity, status, risk, assignee, version, decision/expiry timestamps, and update time. Case details add methodology version, requirements with evidence, reviews, site audits, and corrective actions. Sensitive notes and findings are encrypted at rest; internal review notes are returned only to verification-wide readers.

## Authorization boundaries

- Clinic administrators can create, read, attach evidence to, and submit only cases for their selected active clinic organization.
- Dentists can submit their own dentist case or one tied to a selected active clinic affiliation.
- Verification officers can read the verification queue and verification evidence, but the repository does not expose unrelated patient records.
- Reviewer mutations require explicit case assignment, MFA, the relevant verification permission, no support impersonation, and a current optimistic version.
- Platform and super administrators may read the full queue; high-risk decisions still require independent actors.
- Clean-file checks, subject/tenant consistency, review independence, publishability, and badge projection are also enforced by PostgreSQL constraints and triggers.

Every mutation writes an audit record and an outbox event in the same transaction as the state change. Audit/outbox payloads contain resource identifiers and state metadata, not document contents or reviewer plaintext.

## Background maintenance

The worker registers a durable daily BullMQ job scheduler in the `verification-maintenance` queue and also runs one idempotent startup sweep per UTC date. It examines at most 500 cases per run, emits 90/30/7-day email and in-app reminders using unique evidence/milestone/channel keys, changes projections to `VERIFICATION_EXPIRING` while evidence remains current, and moves expired cases and projections to `EXPIRED`. These system transitions are audited and sent through the outbox.

## Web workspaces

The bilingual verification portal is available under `/[locale]/verification-admin`:

- `/verification-admin` — queue
- `/verification-admin/clinics/:caseId` — clinic workspace
- `/verification-admin/dentists/:caseId` — dentist license review
- `/verification-admin/site-audits/:siteAuditId` — site audit
- `/verification-admin/corrective-actions` and `/corrective-actions/:actionId` — corrective actions
- `/verification-admin/expiring` — expiring evidence
- `/verification-admin/suspensions` — suspension and reinstatement

The browser calls same-origin BFF routes only. Each screen includes loading, empty, error, success, and retry states; production requests are passed through to the API with the authenticated organization scope and idempotency key.
