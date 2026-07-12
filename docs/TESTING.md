# Testing

## Quality gates

Run from the repository root with the pinned Node/pnpm versions:

```bash
pnpm format:check
node scripts/check-placeholders.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

No critical test may be skipped, focused (`only`), disabled, or made order-dependent. CI installs with `--frozen-lockfile` and repeats these gates against clean services.

## Test pyramid

| Level       | Scope                                                                                         | Required emphasis                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Framework-independent domain, auth/security policies, validation                              | State transitions, matching, price math, tenant/caregiver permission, clinic capabilities, availability, immutable pricing, verification/review eligibility, escalation, payment handling |
| Integration | Prisma repositories and NestJS HTTP surface with real PostgreSQL/Redis/provider test adapters | Constraints, transactions, auth, cross-tenant denial, clinic onboarding/team/scheduling, signed-file policy, queues, webhooks, email, audit/outbox, concurrency                           |
| End-to-end  | Browser plus built web/API/worker and isolated services                                       | Full patient/clinic/operations journey, responsive viewports, accessibility, negative authorization, expired links                                                                        |

Coverage is a signal, not a substitute for behavior: minimum 80% meaningful overall and 90% for critical domain/security modules. Generated files, declarations, and trivial barrels may be excluded with a documented configuration; business branches may not.

## Isolation and fixtures

- Use a dedicated database name/URL that cannot resolve to development or production.
- Apply committed migrations to an empty database before the suite.
- Generate deterministic IDs/times through fixtures; freeze time for expiry/aftercare behavior.
- Reset with transaction rollback or schema truncation that respects parallel workers.
- Use Mailpit/in-memory delivery, Stripe test fixtures with real signature construction, private local object storage, and deterministic malware verdicts.
- Never call live providers or depend on test execution order.

## Required E2E journey

Before a production release, the release suite must cover public clinic discovery; registration/email verification; onboarding/case/upload; caregiver invite and revocation; concierge match; verification approval; two clinic plans and comparison; clarification/consultation; immutable plan acceptance; test deposit and signed webhook booking; milestones/change acknowledgement; passport; aftercare escalation; verified review/response; warranty; privacy export; cross-tenant rejection; and expired secure-link rejection.

Each critical page includes automated accessibility assertions and desktop/mobile viewport coverage. Visual regression baselines are reviewed intentionally and never mass-updated to hide defects.

## Security and concurrency cases

- Repeat every protected resource request as an unauthenticated actor, wrong role, wrong organization, unassigned same-role actor, revoked caregiver, and expired elevation.
- Race plan acceptance, capacity-limited appointment allocation, immutable clinic price publication, refund, webhook replay, and job retry; assert one durable result.
- Validate upload size/type/magic bytes, quarantined access, malware rejection, and signed-link expiry.
- Assert logs/error responses do not contain passwords, tokens, authorization headers, sensitive request bodies, signed URLs, or stack traces.

## CI evidence

The final delivery records the exact command, commit, environment, exit status, duration, and any intentionally unavailable external check. A production build or container is not considered verified because source compilation alone passed.
