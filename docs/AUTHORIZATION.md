# Authorization

## Policy model

Every protected operation evaluates an explicit access context:

```text
actor identity
+ authenticated session assurance
+ platform role(s)
+ active organization membership and selected tenant
+ resource ownership or case/clinic assignment
+ caregiver/patient grant scope where relevant
+ action-specific state and elevated-access grant
= allow or deny
```

Controllers do not make ad hoc role decisions. They validate transport input, establish the actor, and call application use cases/repository methods that enforce scoped policies. Repositories accept a scope object and never expose an unscoped “find any tenant record” path to regular use cases.

## Role and scope matrix

| Actor                  | Permitted scope                                                           | Explicitly excluded                                                                 |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Patient                | Own profile, cases, grants, plans, payments, messages, records, aftercare | Other patients, internal verification evidence, unrestricted clinic data            |
| Caregiver              | Patient-selected case(s) and grant capabilities while active              | Unshared fields/cases, changing consent, granting onward access                     |
| Dentist                | Cases assigned to the dentist or permitted clinic team                    | Other clinics and unassigned patients                                               |
| Clinic staff           | Assigned clinic cases within staff capabilities                           | Verification decisions and other clinic tenants                                     |
| Clinic administrator   | Own clinic team/configuration and assigned work                           | Platform-role assignment, reviewer decisions, other clinics                         |
| Concierge agent        | Assigned cases and coordination capabilities                              | Unassigned cases unless a recorded elevated grant exists; verification adjudication |
| Verification officer   | Assigned verification files/decisions                                     | Unrelated patient clinical records and financial administration                     |
| Support agent          | Minimum support metadata; sensitive access only by time-bound elevation   | Silent impersonation and routine browsing of medical records                        |
| Finance administrator  | Payment/refund/accounting views needed for duty                           | Clinical contents unrelated to payment handling                                     |
| Content administrator  | Public content revisions                                                  | Patient records, payment data, verification decisions                               |
| Platform administrator | Platform operations allowed by named capability                           | Super-admin-only security controls; unrestricted silent impersonation               |
| Super administrator    | Break-glass platform functions with strong assurance                      | No exemption from audit, reason, expiry, or least-privilege review                  |

## Case policy

A case action is allowed only when at least one resource relationship is current:

- the actor owns the patient profile;
- an active caregiver grant includes that case and capability;
- an active clinic assignment includes the actor's organization and role capability;
- an active dentist/team assignment includes the actor;
- an active concierge/support elevation includes the case and action.

The policy also validates lifecycle state: for example, an assigned clinic may submit a plan only while submissions are open, and a patient may acknowledge only a plan version issued for their case.

Clinic operations first resolve an active selected organization membership and the matching active clinic-staff record. `CLINIC_ADMIN` receives the documented default clinic capabilities; dentist and staff access is further bounded by stored custom permissions and assigned locations. Onboarding, team administration, case inbox decisions, scheduling, service/pricing, analytics, and billing each require their named capability. Team administrators cannot grant permissions outside the target clinic role's allowlist, change another tenant, or silently keep access after suspension/removal. Invitation acceptance is bound to the invited email and requires current MFA with no support impersonation.

Appointment reads allow the patient owner, a current caregiver grant with `VIEW_APPOINTMENTS`, or a current selected-organization assignment. Patient owners and the assigned selected clinic may reschedule/cancel; appointment creation and attendance are clinic-staff actions requiring current MFA. The requested clinic, active clinical-visit location, and dentist are revalidated against the case assignment and active affiliation inside the write transaction. Governed availability rules, blocks, policy windows, capacity, and conflicts are also re-evaluated during creation.

Participant messaging allows the patient owner, a current caregiver grant with `PARTICIPATE_IN_MESSAGES`, or a current selected-organization assignment. Platform/support roles do not receive message access merely from a broad case-read role. Internal notes require an assigned selected staff organization and are never exposed by participant-message reads.

Treatment journey and passport clinical reads intentionally use a narrower policy than the generic case summary: only the patient owner or an active assigned selected clinic may read them. Caregiver grants, support impersonation, and broad platform case-read permission do not confer access. Dentists author clinical instructions and passport drafts; selected clinic staff may complete milestones; clinic administrators may publish a provider-authored version and record price changes. Treatment changes require a dentist. Only the patient owner may acknowledge a change or create/revoke an expiring passport share. Repository writes revalidate patient ownership or clinic assignment inside the transaction.

## Administrative elevation and impersonation

Support elevation requires a ticket/case reference, reason, requested capability, resource scope, approver where policy requires it, start/expiry, and audit events for grant/use/revoke. Impersonation is visually obvious, time-limited, cannot elevate beyond the grant, and is never implemented by sharing credentials or minting an unbounded user session.

The implemented grant is activated only with an authenticated support-agent session that has current MFA and an `X-Support-Elevation-Id` header. The guard accepts only the route/capability combinations below; all other routes fail closed even if the subject could normally use them:

| Capability            | Elevated route surface                           |
| --------------------- | ------------------------------------------------ |
| `CASE_READ`           | One case summary read                            |
| `INCIDENT_READ`       | Subject-scoped incident list/detail reads        |
| `INCIDENT_UPDATE`     | Patient-visible incident update only             |
| `PRIVACY_STATUS_READ` | Subject-scoped privacy-request list/detail reads |

Elevation cannot create an incident, submit a review/privacy request, transition a case, close/reopen an incident, process privacy data, moderate content, grant another elevation, or invoke unrelated subject routes. The effective subject and impersonating support actor are both recorded in audit events.

## Denial behavior

- Default deny; absence of a rule is not permission.
- Return `404` when resource existence itself is sensitive; otherwise a stable `403`.
- Record high-value denials and all privileged mutations without logging sensitive payloads.
- Re-evaluate current grants/membership on every sensitive request; do not rely on a long-lived client claim alone.
- Cache authorization only with actor, tenant, resource version, and short expiry in the key.

## Required tests

The policy suite covers every role/action pair plus ownership, membership suspension, wrong tenant, wrong assignment, revoked/expired caregiver grant, stale plan version, support elevation expiry, content/finance separation, and super-admin audit. Integration tests issue real repository queries with two tenants and assert that enumeration, search, direct IDs, signed links, and nested resources cannot cross the boundary.
