# Bounded load checks

These k6 scripts establish a staging baseline; they are not volumetric DDoS tools. Every run requires `TARGET_BASE_URL`. Remote runs additionally require an exact `APPROVED_TARGET_ORIGIN` and an explicit `TARGET_ENV`. VUs and duration have hard caps in `k6/safe-target.js`.

Local examples:

```bash
TARGET_BASE_URL=http://127.0.0.1:4000 \
INTERNAL_HEALTH_TOKEN=development-internal-health-token-change-me \
  k6 run load-tests/k6/health-endpoints.js
TARGET_BASE_URL=http://127.0.0.1:3003 VUS=20 DURATION=90s \
  k6 run load-tests/k6/public-burst.js
```

Approved staging example:

```bash
TARGET_BASE_URL=https://staging.example.test \
APPROVED_TARGET_ORIGIN=https://staging.example.test \
TARGET_ENV=staging PUBLIC_PATHS=/,/vi/clinics VUS=25 DURATION=120s \
  k6 run load-tests/k6/public-burst.js
```

Production is refused unless an approved change window deliberately sets the exact break-glass phrase encoded in the safety helper. Prefer a production-like isolated environment. Never include mutation, authentication, upload, payment, webhook, or patient-data paths in `PUBLIC_PATHS`.

`health-endpoints.js` targets the API origin, including its `/api/v1` prefix. It requires the
internal health token and should run only from the same protected monitoring/load-test network
that may reach readiness. `public-burst.js` targets a public frontend origin.

Record the commit, target environment, edge/WAF mode, instance counts, RPS, p95/p99 latency, 4xx/5xx rates, memory, event-loop delay, database pool usage, queue age, and rollback trigger with each result.
