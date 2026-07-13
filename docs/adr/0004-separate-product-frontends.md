# ADR 0004: Separate product frontends

- Status: Accepted
- Date: 2026-07-13

## Context

Patients, dental providers, and platform operators have materially different goals, vocabulary, interaction density, device usage, and safety constraints. A single role-switched portal encourages shared application shells and high-level components, causing operational concepts to leak into the patient experience.

## Decision

Dental Trust will ship three independently buildable and deployable frontend products:

1. `apps/care`: mobile-first consumer care app for patients and caregivers.
2. `apps/provider`: mobile/tablet-first clinical workflow app for dentists and clinic teams.
3. `apps/operations`: desktop-first console for concierge, verification, and platform administration.

`apps/web` remains a temporary public-site and authentication gateway during migration. It must not receive new protected product workflows. Legacy protected routes are removed only after their replacement has authorization, parity, and end-to-end coverage.

All products may share domain rules, transport contracts, authentication policy, API clients, design tokens, and accessible primitives. They must not import application shells, navigation, dashboards, case workspaces, or workflow components from another frontend application.

## Runtime topology

| Product                            | Local port | Production example        |
| ---------------------------------- | ---------: | ------------------------- |
| Care                               |       3000 | `care.dentaltrust.vn`     |
| Provider                           |       3001 | `provider.dentaltrust.vn` |
| Operations                         |       3002 | `ops.dentaltrust.vn`      |
| Public/auth gateway (transitional) |       3003 | `www.dentaltrust.vn`      |
| API                                |       4000 | `api.dentaltrust.vn`      |

Authentication uses a short-lived, one-time authorization exchange for cross-subdomain SSO. Wildcard session cookies are prohibited. Each product owns a host-only, HttpOnly, Secure session cookie and re-evaluates role, organization, MFA, and resource scope at its BFF/API boundary.

## Experience constraints

- Care uses plain-language projections and never exposes internal state codes, SLA terminology, RBAC, or operational ownership types.
- Provider exposes clinical and clinic workflow concepts only to authorized organization members.
- Operations optimizes for queues, exceptions, risk, auditability, and high-density desktop workflows.
- A backend case remains the single source of truth; each product receives a purpose-specific projection.

## Consequences

The repository gains additional build and deployment units and some intentional UI duplication. This cost is accepted to protect product autonomy, prevent experience coupling, and allow independent release cadence and performance budgets.
