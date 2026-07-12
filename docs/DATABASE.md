# Database

PostgreSQL is the authoritative store. Prisma owns the schema, generated client, migrations, and development seed under `packages/database`. Redis is not a second system of record.

## Modeling rules

- Primary keys are opaque identifiers; public slugs are separate mutable attributes with uniqueness constraints.
- Tenant-owned records include an organization or patient/case scope that repositories must filter explicitly.
- Money is an integer minor-unit amount plus ISO currency.
- Instants are stored in UTC; a separate IANA timezone is retained where the user's intended wall time matters.
- Medical, identity, authorization, payment, and verification histories use append-only events or versioned rows rather than destructive overwrites.
- Sensitive fields are encrypted before persistence using the configured application key; searchable low-sensitivity metadata is separated from encrypted payloads.
- Idempotency keys, provider event IDs, plan version numbers, slot allocations, and active access grants are protected by database constraints, not only application checks.
- Foreign keys and restrictive delete behavior prevent orphaned clinical/audit history. Deletion/anonymization is an explicit privacy workflow.

## Logical groups

| Group                   | Representative records                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Identity/access         | user, role/permission definitions, user roles, sessions, lifecycle token, MFA configuration/recovery code, organization membership |
| Organizations/directory | organization, clinic/location/staff, dentist/affiliation/license, service/procedure, price and warranty policy                     |
| Patient/case            | patient profile, emergency contact, consent and intake/medical data, case/status history, assignment, caregiver grant              |
| Care planning           | treatment plan, immutable version, item, acceptance                                                                                |
| Scheduling/payment      | appointment, booking, payment, refund                                                                                              |
| Files/verification      | file asset, case document, secure share, verification case/evidence                                                                |
| Messaging/journey       | thread, message/attachment, internal note, milestone/event, plan change, passport and clinical material records                    |
| Aftercare/trust         | aftercare plan/check-in/escalation, review, incident/event/attachment, warranty claim                                              |
| Platform integrity      | notification/preference, contact request, content page, privacy request, support elevation, audit log, outbox and webhook event    |

The exact physical inventory is defined by `packages/database/prisma/schema.prisma`; this document explains its operational and consistency contract rather than duplicating generated DDL.

## Migration workflow

Create a migration only from a reviewed schema change in a development database. Commit both the schema and generated migration SQL.

```bash
pnpm db:generate
pnpm --filter @dental-trust/database db:migrate:dev -- --name descriptive_change
pnpm typecheck
pnpm test:integration
```

CI creates an empty PostgreSQL database and runs the committed deployment migration path. Production uses:

```bash
pnpm db:migrate:deploy
```

Migrations must be backward-compatible with the currently serving application during a rolling deployment. Large rewrites use expand/backfill/contract releases. Destructive operations require a verified backup, restore rehearsal, and explicit maintenance plan.

## Transactions and concurrency

- Accepting a plan locks or conditionally updates its current version, creates the acknowledgement, writes audit/outbox records, and advances the case atomically.
- Booking uses a uniqueness constraint or serializable allocation to prevent double-booking.
- Payment webhook processing inserts the provider event ID first; replays return the recorded result.
- Verification decisions update eligibility and append decision/audit records in one transaction.
- Journey commands revalidate the assigned clinic inside the transaction; milestones use conditional versions, instructions and plan changes are append-only, and patient change acknowledgement is bound to the owning session.
- Passport draft allocation locks the passport version sequence. Publication atomically creates generated-file metadata, publishes one immutable version, supersedes the previous version, and writes audit/outbox evidence. Opaque-share access increments its bounded counter and appends the access outcome in one transaction.
- Worker claims use bounded leases and stable deduplication keys; a crash may cause re-execution, so handlers remain idempotent.

Journey/passport migration constraints enforce case-to-milestone, plan-version-to-case, acknowledgement-to-patient-session, dentist-to-clinic, completed-case, and published-file-to-share integrity. Provider instructions, plan changes, acknowledgements, access logs, and passport content reject destructive mutation. Passport child collections are immutable after publication; checksum/encryption-envelope/publication-coherence and share expiry/revocation/access-count rules are database checks rather than application assumptions.

## Seed and reset

`pnpm db:seed` is deterministic and idempotent for local/test use. Seed credentials are development-only and guarded from production. `pnpm db:reset` is destructive and must never target a shared or production URL.

## Backup

Logical backup and restore helpers live in `scripts/`. Production also needs provider-native encrypted snapshots, point-in-time recovery, retention, and cross-account/cross-region copies according to approved RPO/RTO. See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).
