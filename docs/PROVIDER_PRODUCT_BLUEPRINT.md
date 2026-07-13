# Provider product blueprint

The Provider product is the daily operating workspace for dentists, clinic staff, and clinic administrators. It is not a reskinned patient portal and it is not the internal Dental Trust operations console.

## Product principles

1. **Clinical work first.** The first screen answers what needs attention, why it matters, who owns it, and the next safe action.
2. **Case context stays together.** Treatment decisions, plans, records, appointments, communication, milestones, and aftercare are organized around a patient-authorized case.
3. **Least privilege is visible.** The UI exposes only the selected clinic scope and indicates when MFA or an additional permission is required.
4. **No simulated success.** Mutations go through the authenticated Provider BFF, are validated with shared contracts, require idempotency keys, and surface loading, success, and failure states.
5. **Mobile supports response work.** Mobile prioritizes triage, case review, messaging, attendance, and schedule changes. Dense configuration remains usable but is optimized for larger screens.

## Information architecture

### Primary workspace

- **Today:** personal work queue, SLA risk, appointments, aftercare, and clinic capacity.
- **Cases:** searchable and filterable assigned opportunities and active clinical cases.
- **Case detail:** overview, intake context, records, treatment plan, appointments, messages, clinical progress, passport, and aftercare.
- **Schedule:** day/week agenda, availability, time off, capacity, conflicts, and calendar sync status.
- **Messages:** case-scoped secure communication with unread state and explicit internal-note separation.
- **Clinic:** organization readiness, locations, verification, team, dentists, services, pricing, billing, and analytics.

### Key workflows

1. Review an assigned opportunity, accept/decline/request records, and assign a dentist.
2. Review patient-authorized data and uploaded records without exposing unrelated patient information.
3. Build and publish an immutable treatment-plan version with risks, limitations, inclusions, exclusions, warranty, and price.
4. Create or reschedule appointments with timezone, capacity, and conflict awareness.
5. Send case-scoped messages and preserve internal notes as a separate audience.
6. Record treatment milestones, aftercare responses, incidents, and Dental Passport data.
7. Invite team members, assign locations and permissions, enforce MFA, and audit access changes.
8. Publish versioned service prices without overwriting historical prices used in accepted plans.

## UI states required on every connected surface

- loading/skeleton
- empty with a useful next action
- recoverable error with retry
- permission/MFA blocked state
- submitting/disabled state
- confirmed success with refreshed server state
- validation at the field and form level

## Release gates

- shared contract validation at the BFF boundary
- selected-organization scope on every upstream request
- idempotency key on every mutation
- no cross-case or cross-tenant navigation shortcuts
- keyboard-visible focus and semantic controls
- no horizontal overflow at 390, 1024, and 1440 CSS pixels
- Provider typecheck, lint, unit tests, production build, Docker health, and browser console checks
