# DENTAL TRUST Repository Context

This file is a working map for engineers and coding agents. It summarizes the repository's current architecture, ownership boundaries, safety constraints, and development workflow. Detailed domain and operational documents under `docs/` remain authoritative.

## Product and status

DENTAL TRUST is a bilingual (`en`/`vi`) cross-border dental-care coordination and trust platform for overseas Vietnamese. It helps patients and caregivers discover verified clinics and dentists in Vietnam, compare structured treatment plans, coordinate bookings and travel, exchange private records, and continue aftercare abroad.

The platform coordinates care. It does not diagnose, replace licensed clinical judgment, guarantee outcomes, or sell ranking or verification status. Product copy and AI behavior must preserve that boundary.

This repository is a substantial implementation foundation, not a production-ready release. It contains connected identity, case, clinic operations, verification, booking/payment, file, journey/passport, notification, privacy, trust/safety, and AI Care slices, but production provider integrations, complete role journeys, multi-service E2E coverage, legal/retention decisions, and several operational controls remain release blockers. Never use production patient, clinical, payment, or credential data here. Read `docs/KNOWN_LIMITATIONS.md` before describing a feature as complete.

## Runtime topology

The project is a private pnpm/Turborepo TypeScript monorepo. Node.js `>=22.12` and the pnpm version pinned in `package.json` are the supported toolchain.

| Runtime           | Responsibility                                                                    |                            Local port |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------: |
| `apps/care`       | Mobile-first patient and caregiver product                                        |                                `3000` |
| `apps/provider`   | Dentist and clinic-team workflow product                                          |                                `3001` |
| `apps/operations` | Concierge, verification, and administration console                               |                                `3002` |
| `apps/web`        | Transitional public site and authentication gateway                               |                                `3003` |
| `apps/api`        | NestJS modular-monolith HTTP API, prefixed `/api/v1`                              |                                `4000` |
| `apps/worker`     | BullMQ jobs, outbox delivery, scanning, notifications, reminders, and maintenance | health port configured by environment |

PostgreSQL is the system of record. Redis/BullMQ coordinates ephemeral asynchronous work. S3-compatible private object storage holds files. Local Compose also provides Mailpit and ClamAV. Stripe is the initial payment adapter; Mapbox powers the Care clinic map with an OpenStreetMap continuity fallback.

## Repository map

### Applications

- `apps/care`: canonical patient/caregiver experience. It owns discovery, AI Care, comparison, booking, journey, messaging, notifications, and account surfaces.
- `apps/provider`: canonical clinic/dentist daily workspace. It owns clinic onboarding/profile, case worklists, clinical collaboration, schedules, messages, and provider actions.
- `apps/operations`: canonical operations workspace. It owns coordination, verification, governance, and privileged administrative workflows.
- `apps/web`: public bilingual content and the shared authentication gateway. Legacy protected portal routes are compatibility surfaces only. Do not add new protected product workflows here; migrate them to Care, Provider, or Operations with authorization, parity, and E2E coverage.
- `apps/api`: feature modules made from controllers, services/policies, and database repositories. `app.module.ts` is the module registry; `main.ts` configures the global prefix, CORS, security headers, raw webhook bodies, Swagger outside production, timeouts, and shutdown.
- `apps/worker`: durable asynchronous processing. PostgreSQL outbox state is authoritative; queue state is not irreplaceable business evidence.

Frontend products may share contracts, policies, tokens, API helpers, and accessible UI primitives. They must not import another product's shell, navigation, dashboard, or workflow components.

### Shared packages

- `packages/domain`: framework-independent state transitions, invariants, projections, and value rules. It must not depend on HTTP, Next.js, NestJS, Prisma, queues, or provider SDKs.
- `packages/contracts`: stable transport types and Zod request/response schemas shared across boundaries.
- `packages/validation`: common runtime parsing helpers.
- `packages/auth`: role, permission, tenant, ownership, caregiver, case-assignment, MFA, and support-elevation policy helpers.
- `packages/database`: Prisma schema/client, committed migrations, deterministic development seed, and scoped repositories.
- `packages/api-client`: typed transport boundary. It exists but is not yet the only frontend transport.
- `packages/config`: validated public/server environment loading. Do not read loosely typed environment values throughout feature code.
- `packages/security`: encryption, hashing, redaction, token/webhook, request-policy, and BFF-context utilities.
- `packages/observability`: structured logging, metrics, request context, tracing, and safe error reporting.
- `packages/ui`: shared accessible primitives and design tokens, not product workflows.
- `packages/i18n`: shared English/Vietnamese messages.
- `packages/testing`: deterministic factories, fixtures, and test helpers.
- `packages/eslint-config` and `packages/typescript-config`: repository-wide static-analysis rules.

Dependency direction points inward: frontends/API/worker depend on shared contracts and policies; persistence depends on domain rules; domain code never depends on frameworks or infrastructure. Avoid cycles between feature modules. Cross-module side effects use an explicit application contract or domain/outbox event, not direct access to another module's tables.

## Typical request and event flow

1. A frontend BFF/route handler receives the browser request and forwards only allowlisted context. Browser sessions use host-only, secure, `HttpOnly`, same-site cookies; bearer tokens are not stored in local storage.
2. The API authenticates the session, resolves the active organization/resource scope, validates transport data with shared Zod contracts, and applies role/MFA/resource policy.
3. A service invokes framework-independent domain rules and a scope-aware repository.
4. The transaction writes the state change together with required idempotency, audit, and outbox evidence.
5. The worker claims queued/outbox work with bounded leases, retries, deduplication, and dead-letter behavior. Handlers must tolerate replay.
6. Responses use stable `camelCase` contracts and include a request ID. Expected failures use the shared error envelope; do not expose stack traces, SQL, object keys, provider details, or out-of-scope resource existence.

Representative API feature structure:

```text
apps/api/src/<feature>/
  <feature>.module.ts       # Nest registration
  <feature>.controller.ts   # auth guard, params/body/query parsing, response envelope
  <feature>.policy.ts       # feature-specific authorization when needed
  <feature>.service.ts      # orchestration and domain calls
  *.spec.ts                 # behavior, policy, contract, and regression tests
packages/contracts/src/<feature>.ts
packages/database/src/repositories/<feature>.repository.ts
packages/domain/src/<feature>.ts
```

Not every feature needs every layer, but new code should follow the existing boundary rather than placing business rules in controllers, React components, or Prisma calls spread across applications.

## Non-negotiable invariants

### Authorization and tenancy

- A role name alone is never authorization. Evaluate identity, active membership, selected organization, tenant/resource scope, ownership or assignment, explicit caregiver grants, current MFA, and impersonation/elevation restrictions as applicable.
- Repositories must scope tenant-owned reads and writes explicitly. Conceal unauthorized resource existence with the documented response where required.
- Caregiver grants are opt-in, capability-scoped, revocable, and optionally time-bound. Support access is reasoned, MFA-backed, short-lived, visible, and audited.
- Re-check current authorization before issuing any signed download/share URL; an object key is never authorization.

### Data and consistency

- PostgreSQL is authoritative. Critical intent must not live only in Redis, a queue, cache, browser state, or provider response.
- Mutations that may be retried require a validated idempotency key. Provider webhooks use the unique provider event ID. Replays return or reconcile the durable result.
- Use optimistic versions, locks, conditional updates, and database constraints for concurrent state changes. Do not rely only on a prior read.
- Write business state, audit evidence, and outbox intent atomically when the workflow requires all three.
- Histories such as plan acceptance, journey changes, passport publication, verification decisions, payment evidence, privacy execution, and clinical/audit records are append-oriented or versioned. Do not silently rewrite history.
- Money is `{ amountMinor, currency }` using integer minor units and ISO-4217 codes. Never use floating-point major units for persisted or transport money.
- Instants are RFC 3339 UTC values. Preserve an IANA timezone when wall-clock intent matters. Date-only values use `YYYY-MM-DD`.
- List APIs are bounded and normally cursor-paginated. Do not introduce unbounded table reads.

### Restricted data and integrations

- Unknown patient-related data defaults to Restricted. Never put clinical text, credentials, tokens, private filenames/objects, signed URLs, payment secrets, or sensitive bodies into logs, telemetry, analytics, audit payloads, outbox payloads, tests, source control, or AI prompts unless a reviewed workflow explicitly permits it.
- Encrypt designated sensitive fields before persistence with resource-bound context. Store routine lookup tokens as one-way hashes. Keep keys and provider secrets in validated deployment configuration.
- Files remain private and quarantined until size, signature/MIME, checksum, and malware checks succeed. Downloads use short-lived signed URLs after fresh authorization.
- Payment amount and currency come from the accepted booking/plan, never browser input. Only verified Stripe webhook evidence settles a payment or refund; a synchronous provider response is not settlement.
- Verification is evidence-based, expiring, revocable, and independent of payment or ranking. Public claims derive only from approved, current evidence.
- Email/SMS notifications use minimal disclosure and link users back to authenticated product surfaces. They are not authoritative clinical channels.

### Product and language

- English and Vietnamese are equal product locales. Do not ship untranslated keys, mixed-language placeholders, or fabricated fallback content.
- Care uses plain language and must not expose internal status codes, RBAC concepts, or operational SLA vocabulary.
- Provider shows clinic/clinical workflows only inside the authorized organization.
- Operations favors auditable queues, exceptions, risk, and dense desktop workflows.
- A backend case remains the single source of truth; each product receives a purpose-specific projection.
- AI Care output and actions are server-controlled. Emergency routing remains local and must not depend on a model provider. AI content must not become diagnosis or bypass case, booking, messaging, payment, or role authorization.

## Database changes

The physical schema is `packages/database/prisma/schema.prisma`. Repositories are the application persistence boundary. For a reviewed schema change:

```bash
pnpm db:generate
pnpm --filter @dental-trust/database db:migrate:dev -- --name descriptive_change
pnpm typecheck
pnpm test:integration
```

Commit both the Prisma schema and generated SQL. Deployment uses `pnpm db:migrate:deploy`. Migrations must remain compatible with the currently serving application during rolling releases; use expand/backfill/contract for large changes. Never edit or delete already-applied migration history casually. `pnpm db:reset` is destructive and is only for a confirmed disposable local/test database.

## Local workflow

First-time/full-stack startup:

```bash
cp .env.example .env
make restart
docker compose run --rm api pnpm db:seed
```

`make restart` rebuilds, applies committed migrations, recreates the stack, and waits for health without deleting volumes. Use `pnpm dev` only when intentionally running application processes on the host. Configuration is parsed through `@dental-trust/config`; `.env.example` documents the expected variables, but real `.env` files and secrets must not be committed.

Useful root commands:

```bash
pnpm format:check
node scripts/check-placeholders.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm check:frontend-boundaries
```

Use `pnpm --filter <workspace> <script>` for a focused loop. Unit tests use Vitest, API integration tests use real boundaries/Supertest where configured, and browser E2E uses Playwright. Critical authorization changes need negative tests for unauthenticated, wrong-role, wrong-tenant, unassigned, revoked, expired, MFA-incomplete, and impersonated contexts as relevant. Concurrency-sensitive changes need replay/race coverage, not only happy-path tests.

Do not claim the repository is verified because one package compiles. Record exactly which relevant commands ran and which provider/integration checks were unavailable.

## Documentation source map

- `README.md`: repository overview, startup, commands, and release warning.
- `docs/ARCHITECTURE.md`: topology, dependency direction, consistency, observability, and deployment model.
- `docs/DOMAIN_MODEL.md`: bounded contexts, ownership, state machines, roles, and invariants.
- `docs/API.md`: transport conventions and workflow-specific HTTP contracts.
- `docs/AUTHORIZATION.md`: role/capability/resource policy and denial behavior.
- `docs/DATABASE.md`: data model, transaction rules, migrations, seed, and backup posture.
- `docs/SECURITY.md`, `docs/THREAT_MODEL.md`, and `docs/DATA_CLASSIFICATION.md`: implemented controls, threats, classifications, and safe handling.
- `docs/PRIVACY_ARCHITECTURE.md` and `docs/TRUST_SAFETY.md`: privacy, consent, support elevation, incident, review, and erasure/export rules.
- `docs/AI_CARE_BOOKING.md`: assistant safety, structured output, tool/action policy, and booking handoff.
- `docs/CARE_PRODUCT_BLUEPRINT.md`, `docs/PROVIDER_PRODUCT_BLUEPRINT.md`, and `docs/OPERATIONS_PRODUCT_BLUEPRINT.md`: product-specific UX and ownership.
- `docs/adr/0004-separate-product-frontends.md`: accepted frontend split and migration direction.
- `docs/LOCAL_DEVELOPMENT.md` and `docs/TESTING.md`: executable setup and quality gates.
- `docs/DEPLOYMENT.md` and `docs/OPERATIONS_RUNBOOK.md`: production topology, rollout, observability, and recovery.
- `docs/KNOWN_LIMITATIONS.md`: current release blockers and closure criteria. Treat this as mandatory before asserting readiness.
- `docs/ASSUMPTIONS.md`: product decisions and unresolved production-owner decisions.

When code, a focused domain document, and this summary disagree, inspect the code and the most specific authoritative document, then update stale documentation as part of the change.

## Change checklist

Before editing, inspect `git status` and preserve unrelated local work. Then identify:

1. The owning product or API feature and the relevant bounded context.
2. The shared contract/schema and authorization policy affected.
3. Tenant, ownership, MFA, idempotency, concurrency, audit/outbox, privacy, and localization implications.
4. Whether a database migration, worker processor, BFF allowlist/proxy change, or API module registration is required.
5. The smallest focused tests plus broader typecheck/lint/build gates needed to support the claim.
6. Which architecture, API, security, runbook, limitation, or product document must change with the behavior.

Prefer a tested vertical slice over an isolated UI, controller, schema, or queue change that leaves the workflow disconnected.
