# Implementation plan

This is the execution record for the one-shot DENTAL TRUST delivery. A checkbox may be marked complete only when the implementation and its verification evidence exist in the repository; the Definition of Done remains the controlling completion gate.

## Delivery slices

1. **Foundation and contracts**
   - Establish the pnpm/Turborepo modular monorepo, strict TypeScript configuration, shared contracts, validated configuration, Prisma migration baseline, and provider interfaces.
   - Gate: clean frozen install, schema generation, typecheck, and committed lockfile.
2. **Identity, authorization, and privacy**
   - Implement email identity lifecycle, secure sessions/tokens, resource-level authorization, caregiver grants, organization scope, support elevation, audit events, sensitive-field encryption, and privacy requests.
   - Gate: negative authorization and tenant-isolation integration tests.
3. **Verification and discovery**
   - Implement clinic/dentist onboarding, evidence review, expiry, public eligibility, methodology content, search, and bilingual public profiles.
   - Gate: verification policy tests and unverified/expired evidence never appearing as verified.
4. **Patient case and treatment-plan workflow**
   - Implement onboarding, cases, uploads, matching, structured plan versioning/comparison, clarification, consultation, acknowledgement, and consent.
   - Gate: immutable plan-version and case-scope tests.
5. **Booking, payment, journey, and aftercare**
   - Implement schedules, booking/deposit/refund states, verified idempotent webhooks, treatment milestones, Dental Passport, check-ins, escalation, incident, warranty, and review eligibility.
   - Gate: state-machine, webhook replay, job retry, and end-to-end tests.
6. **Role-based operations**
   - Implement clinic, concierge, verification, support, finance, content, platform, and super-admin surfaces with assignment and permission boundaries.
   - Gate: route, API, ownership, and assignment matrix tests.
7. **Production readiness**
   - Complete structured logging, health/readiness, telemetry adapters, PWA, accessibility, responsive behavior, performance budgets, backups, runbooks, containers, CI, and deployment guidance.
   - Gate: all quality commands, production build, container build/start, migration rehearsal, backup/restore drill, and smoke tests.

## Cross-cutting rules

- Keep medical and verification claims evidence-based and bilingual.
- Make critical commands idempotent and transactions explicit.
- Store private uploads only in private object storage and issue short-lived signed links after authorization.
- Fail closed when production providers or encryption material are missing.
- Record implementation-changing ambiguity in [ASSUMPTIONS.md](ASSUMPTIONS.md).
- Preserve loading, empty, error, and success states across all user-facing flows.
- Keep `node scripts/check-placeholders.mjs` green; exceptions must be represented as specific, documented limitations rather than source markers.

## Final verification ledger

The authoritative commands and required evidence are maintained in [TESTING.md](TESTING.md). A final handoff must include exact exit outcomes for format, lint, typecheck, unit, integration, end-to-end, production build, migration, seed, and container smoke tests. Known unavailable external credentials must be listed in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), never represented by simulated production success.
