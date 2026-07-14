# DENTAL TRUST

DENTAL TRUST is a bilingual cross-border dental-care coordination and trust platform. It helps overseas Vietnamese evaluate verified clinics and dentists in Vietnam, compare structured treatment plans, coordinate appointments and travel, exchange records securely, and continue aftercare after returning overseas.

The platform coordinates care; it does not diagnose, replace licensed clinical judgment, guarantee outcomes, or sell ranking position.

> **Release status:** this repository is a substantial implementation foundation, not a production-complete release. Identity/session, tenant-scoped cases, private-file scanning, core database invariants, selected bilingual web flows, and operational scaffolding are implemented. Most required product workflows still need connected production API/UI vertical slices, and the coverage/E2E/integration/container gates are not all green. Do not onboard production users or clinical/payment data. See [Known limitations](docs/KNOWN_LIMITATIONS.md).

## Repository layout

```text
apps/
  care/         Mobile-first patient and caregiver product
  provider/     Dentist and clinic workflow product
  operations/   Concierge, verification, and administration console
  web/          Transitional public site and authentication gateway
  api/          NestJS HTTP API and OpenAPI document
  worker/       Durable asynchronous and scheduled work
packages/
  api-client/   Typed client boundary
  auth/         Authentication and authorization policy helpers
  contracts/    Shared transport contracts
  database/     Prisma schema, migrations, repositories, and seed
  domain/       Framework-independent domain rules and state machines
  observability/ Structured logging and telemetry adapters
  security/     Encryption, redaction, and security utilities
  testing/      Factories, fixtures, and test helpers
  validation/   Runtime schemas
docs/           Architecture, security, operations, and product records
```

## Local startup

Prerequisites: Node.js 22 LTS or newer, Corepack, Docker Engine with Compose, and Git.

```bash
cp .env.example .env
docker compose up --build -d
docker compose run --rm api pnpm db:seed
```

Compose runs the complete local platform: the three product frontends, public/auth gateway,
API, worker, migration job, PostgreSQL, Redis, MinIO, Mailpit, and ClamAV. Use `pnpm dev`
only when intentionally running application processes on the host in watch mode.

Local endpoints:

| Service             | URL                              |
| ------------------- | -------------------------------- |
| Patient Care App    | `http://localhost:3000`          |
| Provider App        | `http://localhost:3001`          |
| Operations Console  | `http://localhost:3002`          |
| Public/auth gateway | `http://localhost:3003`          |
| API                 | `http://localhost:4000`          |
| API documentation   | `http://localhost:4000/api/docs` |
| MinIO console       | `http://localhost:9001`          |
| Mailpit             | `http://localhost:8025`          |

Seed identities and development-only passwords are documented in [Local development](docs/LOCAL_DEVELOPMENT.md). They are rejected as production configuration.

## Command surface

| Command                               | Purpose                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                            | Run web, API, and worker in watch mode                          |
| `pnpm build`                          | Create production builds for all workspaces                     |
| `pnpm start`                          | Start built applications                                        |
| `pnpm format:check`                   | Verify formatting without changing files                        |
| `pnpm lint`                           | Run workspace lint rules                                        |
| `pnpm typecheck`                      | Run strict TypeScript checks                                    |
| `pnpm test`                           | Run unit tests                                                  |
| `pnpm test:integration`               | Run integration tests against isolated services                 |
| `pnpm test:e2e`                       | Run browser end-to-end tests                                    |
| `pnpm db:generate`                    | Generate the Prisma client                                      |
| `pnpm db:migrate`                     | Apply committed migrations                                      |
| `pnpm db:seed`                        | Load realistic development data                                 |
| `pnpm db:reset`                       | Destructively reset the selected database                       |
| `node scripts/check-placeholders.mjs` | Reject unfinished-content markers in application/package source |

Run the complete pre-push gate:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

## Documentation

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [AI Care Guide to Booking](docs/AI_CARE_BOOKING.md)
- [Architecture](docs/ARCHITECTURE.md), [domain model](docs/DOMAIN_MODEL.md), and [database](docs/DATABASE.md)
- [API](docs/API.md) and [authorization](docs/AUTHORIZATION.md)
- [Security](docs/SECURITY.md), [threat model](docs/THREAT_MODEL.md), [data classification](docs/DATA_CLASSIFICATION.md), and [privacy architecture](docs/PRIVACY_ARCHITECTURE.md)
- [Verification model](docs/VERIFICATION_MODEL.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md) and [testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md), [backup/restore](docs/BACKUP_RESTORE.md), and [operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Incident response](docs/INCIDENT_RESPONSE.md), [external services](docs/EXTERNAL_SERVICES.md), and [known limitations](docs/KNOWN_LIMITATIONS.md)
- [Recorded assumptions](docs/ASSUMPTIONS.md)

## Security

Do not commit `.env` files, production exports, patient records, credentials, or payment data. Report vulnerabilities using the private process in [SECURITY.md](SECURITY.md).

This repository is proprietary and unlicensed for redistribution.
