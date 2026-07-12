# Domain model

## Bounded contexts

| Context                | Owns                                                                 | Important invariants                                                                                                        |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Identity & access      | users, credentials, sessions, email verification, memberships, roles | Disabled/unverified identities cannot obtain privileged sessions; access always includes resource scope.                    |
| Verification           | evidence, reviews, decisions, expiry, badges                         | Only approved, current, unrevoked evidence contributes to public verification. Reviewer and applicant duties are separated. |
| Directory              | clinics, locations, dentists, services, public profiles              | Published claims derive from approved data; paid placement cannot alter verification.                                       |
| Patient                | patient profile, consent, caregiver grants                           | A caregiver sees only explicitly granted scopes while the grant is active.                                                  |
| Cases & matching       | cases, assignments, matching rationale, tasks                        | Clinic access requires an active assignment; patient/authorized caregiver ownership remains authoritative.                  |
| Treatment plans        | plan submissions, immutable versions, comparisons, acknowledgements  | Accepted versions cannot be edited; material change creates a new version and acknowledgement.                              |
| Scheduling & booking   | availability, consultation, appointment, booking                     | Slots cannot be double-booked; booking references one accepted plan version.                                                |
| Payments               | payment intent, deposit, refund, ledger event                        | Provider callbacks are verified/idempotent; money states follow provider evidence, never client claims.                     |
| Journey & Passport     | milestones, clinical records, passport snapshots                     | Passport output has provenance and does not rewrite the original clinic record.                                             |
| Aftercare              | schedules, check-ins, escalation tasks                               | Concerning answers create an assigned escalation without automated diagnosis.                                               |
| Incidents & warranties | incident, evidence, responsibility, resolution                       | Status history is append-only and visible to authorized parties.                                                            |
| Reviews                | review eligibility, review, clinic response, moderation              | Only completed, attributable journeys are eligible; moderation never changes rating content silently.                       |
| Files                  | object metadata, quarantine, scan result, access grant               | Files are private and quarantined until validated and scanned.                                                              |
| Notifications          | preferences, templates, outbox, delivery attempts                    | Preferences and mandatory transactional categories are distinct; delivery is retry-safe.                                    |
| Audit & privacy        | audit events, export/erasure requests, support elevation             | Audit history is append-only; sensitive support access is visible, time-limited, and attributable.                          |

## Core state machines

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted
  Submitted --> UnderReview
  UnderReview --> MoreEvidenceRequired
  MoreEvidenceRequired --> Submitted
  UnderReview --> Approved
  UnderReview --> Rejected
  Approved --> Expired
  Approved --> Revoked
  Expired --> Submitted: renewal
```

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Open
  Open --> Matching
  Matching --> PlansAvailable
  PlansAvailable --> Consultation
  Consultation --> PlanAccepted
  PlanAccepted --> Booked
  Booked --> InTreatment
  InTreatment --> Aftercare
  Aftercare --> Closed
  Draft --> Cancelled
  Open --> Cancelled
  Booked --> Cancelled: policy-controlled
```

```mermaid
stateDiagram-v2
  [*] --> Created
  Created --> RequiresAction
  Created --> Processing
  RequiresAction --> Processing
  Processing --> Succeeded
  Processing --> Failed
  Succeeded --> PartiallyRefunded
  Succeeded --> Refunded
  Failed --> Processing: safe retry/new intent
```

All transitions are implemented through use cases that authorize the actor, validate the current version, persist the state change, append an audit event, and enqueue required side effects in one transaction.

## Entity relationship overview

```mermaid
erDiagram
  USER ||--o{ MEMBERSHIP : has
  ORGANIZATION ||--o{ MEMBERSHIP : contains
  ORGANIZATION ||--o| CLINIC : represents
  CLINIC ||--o{ DENTIST : includes
  CLINIC ||--o{ VERIFICATION_CASE : submits
  VERIFICATION_CASE ||--o{ VERIFICATION_EVIDENCE : contains
  USER ||--o| PATIENT_PROFILE : owns
  PATIENT_PROFILE ||--o{ CAREGIVER_GRANT : authorizes
  PATIENT_PROFILE ||--o{ DENTAL_CASE : opens
  DENTAL_CASE ||--o{ CASE_ASSIGNMENT : assigned
  CLINIC ||--o{ CASE_ASSIGNMENT : receives
  DENTAL_CASE ||--o{ TREATMENT_PLAN : receives
  TREATMENT_PLAN ||--|{ TREATMENT_PLAN_VERSION : versions
  TREATMENT_PLAN_VERSION ||--o| BOOKING : accepted_for
  BOOKING ||--o{ PAYMENT : funded_by
  DENTAL_CASE ||--o{ JOURNEY_MILESTONE : tracks
  DENTAL_CASE ||--o| DENTAL_PASSPORT : produces
  DENTAL_CASE ||--o{ AFTERCARE_CHECKIN : follows
  DENTAL_CASE ||--o{ INCIDENT : may_raise
  DENTAL_CASE ||--o{ REVIEW : may_receive
  DENTAL_CASE ||--o{ FILE_OBJECT : attaches
```

The physical schema is documented in [DATABASE.md](DATABASE.md). Transport representations are versioned separately from domain entities and must not expose private persistence fields.
