# Local development

## Prerequisites

- Node.js 22 LTS or newer (the repository engine field is authoritative).
- Corepack and the pnpm version pinned by `packageManager`.
- Docker Engine with Docker Compose v2+.
- Git. PostgreSQL client tools are optional unless running backup scripts from the host.

## First run

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`docker compose up -d` starts PostgreSQL (`5432`), Redis (`6379`), MinIO (`9000`, console `9001`), Mailpit (`1025`, UI `8025`), and ClamAV (`3310`). ClamAV's first signature download can take up to several minutes; inspect `docker compose ps` and `docker compose logs clamav` rather than bypassing a production scan requirement.

Web runs at `http://localhost:3000`; API runs at `http://localhost:4000`, with versioned routes under `/api/v1` and documentation at `/api/docs`.

## Development accounts

The deterministic database seed is the source of truth for these identities. It fails when `NODE_ENV=production`. All seeded users use the shared local-only password `DentalTrustDev!2026`.

| Role                 | Email                              |
| -------------------- | ---------------------------------- |
| Super administrator  | `admin@dentaltrust.local`          |
| Patient              | `patient@dentaltrust.local`        |
| Caregiver            | `caregiver@dentaltrust.local`      |
| Concierge agent      | `concierge@dentaltrust.local`      |
| Verification officer | `verification@dentaltrust.local`   |
| Clinic administrator | `clinic.admin@saigon-smiles.local` |
| Dentist              | `dentist@saigon-smiles.local`      |

The seed also creates 10 clinics, 20 dentists, service/price/warranty data, a patient case with caregiver and clinic assignments, a published treatment-plan version, and approved verification evidence. The seed's constants remain the executable source of truth.

> Never copy seeded hashes, tokens, passwords, or local MinIO/PostgreSQL credentials to a shared or production environment.

## Common workflows

Apply existing migrations and reseed:

```bash
pnpm db:migrate
pnpm db:seed
```

Create a reviewed development migration after changing the Prisma schema:

```bash
pnpm --filter @dental-trust/database db:migrate:dev -- --name descriptive_change
pnpm db:generate
```

Destructively rebuild only a disposable local database:

```bash
pnpm db:reset
pnpm db:seed
```

Run one workspace:

```bash
pnpm --filter @dental-trust/web dev
pnpm --filter @dental-trust/api dev
pnpm --filter @dental-trust/worker dev
```

Inspect local email at `http://localhost:8025` and private objects at `http://localhost:9001`. Payment flows use the development/test adapter; they do not represent a production settlement.

## Environment validation

Application processes parse environment variables through `@dental-trust/config`. To preflight a populated shell:

```bash
set -a
. ./.env
set +a
node scripts/verify-env.mjs
```

Production mode additionally rejects development secrets/adapters and missing Stripe signing material. See [EXTERNAL_SERVICES.md](EXTERNAL_SERVICES.md).

## Troubleshooting

- `pnpm` attempts a network lookup: ensure `packageManager` is present and run `corepack prepare pnpm@<pinned-version> --activate` when network access is available.
- Port conflict: set the documented compose port override or stop the conflicting service; keep application URLs consistent.
- Database unavailable: run `docker compose ps`, then `node scripts/wait-for-service.mjs localhost 5432`.
- MinIO bucket missing: rerun `docker compose up minio-init` after MinIO becomes healthy.
- Mail not visible: confirm API/worker use `SMTP_HOST=localhost` and `SMTP_PORT=1025` when running on the host.
- Tests point at development data: stop and set a separate test database URL before integration/E2E tests.

Stop services with `docker compose down`. Add `--volumes` only when intentionally deleting all local database, object, queue, and scanner data.

## Verification record

On 2026-07-12, the complete pinned stack was pulled and health-checked on arm64. Because host ports `5432` and `55432` were already occupied, verification used `POSTGRES_PORT=0 REDIS_PORT=0 docker compose up -d`; Docker assigned PostgreSQL `55000` and Redis `55001` for that run. PostgreSQL, Redis, MinIO, Mailpit, and ClamAV reported healthy, and `minio-init` exited `0` after creating `dental-trust-private` with private access. The committed developer defaults remain `5432` and `6379`.
