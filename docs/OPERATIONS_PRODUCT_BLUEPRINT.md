# Operations product blueprint

Operations is the internal control plane for Dental Trust. It serves three distinct operating modes—coordination, verification, and platform administration—inside one role-aware shell, while preserving separate queues, permissions, decision models, and audit requirements.

## Product principles

1. **Operate from exceptions.** The command center prioritizes SLA breaches, risk, blockers, failed delivery, and decisions that require human judgment.
2. **Queues are the source of work.** Coordination and verification use live, searchable queues with ownership, deadline, risk, and next action visible before opening a record.
3. **Context opens beside the queue.** Record workspaces use a drawer so operators can inspect, decide, and return without losing position or filters.
4. **Privileged actions are deliberate.** Mutations require shared-contract validation, same-origin requests, an idempotency key, expected state/version, MFA where policy requires it, and a human-readable reason.
5. **Roles shape the product.** Concierge agents see case coordination; verification officers see evidence and four-eyes controls; platform administrators see identity, reliability, organizations, security, and immutable audit data.
6. **No simulated operational state.** Counts, queue records, status, evidence, jobs, webhooks, and audit entries come from the authenticated API. Unavailable scopes render an explicit state instead of sample data.

## Information architecture

### Command center

- cross-domain operational metrics
- merged priority list ordered by SLA or expiry
- coordination workload pulse
- delivery reliability status
- recent privileged activity
- command search for direct navigation

### Coordination workspace

- organization-scoped concierge dashboard and queue
- filters for all, mine, unassigned, urgent, and overdue
- case summary, journey dates, missing documents, and patient-authorized context
- status and priority update with version conflict protection
- case tasks and internal notes
- clear loading, permission, empty, error, and success states

### Verification workspace

- filters for ownership, risk, and decisions requiring review
- clinic and dentist verification cases
- requirement and evidence checklist
- evidence approval or rejection with a recorded rationale
- reviewer assignment
- decision workflow with expiry where applicable
- four-eyes review and second approval that prevents self-approval
- corrective-action visibility

### Administration control plane

- real platform health metrics
- user identity directory with status, role, MFA, session, and email-verification context
- organization directory with type, membership, lifecycle, and isolation context
- reliability console for outbox, notification, and webhook delivery
- privileged retry with reason and expected attempt count
- account lock, suspension, and activation with explicit confirmation
- immutable audit trail with actor, resource, reason, time, and result
- security view explaining the effective session and enforced guardrails

## Interaction and visual system

- Readable 15–16 px operating text, 30–40 px page titles, and compact 11–13 px metadata only where hierarchy requires it.
- Desktop uses a persistent role-aware sidebar and dense operational lists; mobile uses a drawer navigation, bottom navigation, stacked metrics, record cards, and full-width detail drawers.
- Status always combines text with color; color is never the only signal.
- Buttons, links, forms, tabs, dialogs, drawers, and command search use semantic controls and visible keyboard focus.
- Long queues retain scan density on desktop and become structured cards below 768 CSS pixels.

## Security and reliability gates

- authenticated session validated by the Operations server boundary
- role and organization scope selected server-side
- same-origin validation for every BFF mutation
- shared Zod contract validation at the command boundary
- idempotency key for every mutation
- expected version, state, or attempt count for conflict-aware changes
- MFA gate for privileged sessions where policy requires it
- immutable audit logging of privileged actions and reasons
- no raw access token exposure to client components

## Release gates

- Operations typecheck, lint, unit tests, and production build
- Docker readiness check on port 3002
- authenticated browser QA for command center, coordination, verification, and administration
- responsive QA at 390 and desktop widths
- drawer, dialog, account menu, logout, search, filters, and direct query routes verified
- no server runtime errors in container logs
