# Trust and safety workflows

This module implements the incident and verified-review requirements in sections 5.15 and 5.16 of the product specification. Trust and safety records are tenant-scoped, idempotent, audited, and retained when a clinic or staff account is suspended.

## Incident intake and lifecycle

Patient intake uses seven explicit categories: pain or symptoms, treatment concern, billing dispute, service complaint, record correction, privacy concern, and warranty claim. The patient supplies a bounded narrative, severity, and optional clean case-document attachments. The server assigns the response SLA and derives all ownership and linkage data.

Every incident exposes its assigned owner, attachment references, response deadline, patient-visible timeline, clinic responses, resolution proposal, closure reason, warranty or refund linkage, reopen history, and append-only audit history. Internal notes are returned only to authorized incident managers and never appear in a patient response. Clinic responses and patient updates are separate event kinds even though both are patient-visible.

Managers may triage, add an internal note, respond for the clinic, escalate, propose a resolution, close, or reopen an incident. Escalation must raise severity to high or critical. State-changing commands use idempotency keys, optimistic concurrency where a prior version is required, an audit record, and an outbox event in one transaction.

Suspending a clinic, organization membership, or user account does not delete or detach incidents, events, attachments, warranty claims, or refund links. Database foreign keys and deletion guards preserve the record for investigation, patient access, legal retention, and later reactivation.

## Verified reviews

Only the treated patient may submit a review, and the linked case must have a completed platform booking. Procedure category and treatment date are server-derived snapshots. The eight rating dimensions are communication, transparency, cleanliness and environment, scheduling, cost accuracy, treatment experience, aftercare, and overall experience.

The review response exposes procedure category, treatment date, review date, follow-up duration, verification status, moderation state, patient-approved media, later milestone reviews, and the clinic response. Media must be an available, malware-cleared document from the reviewed case and requires an explicit patient consent confirmation at submission time.

Follow-up reviews are supported at 30, 90, 180, and 365 days after treatment. A milestone can be submitted only once and only after it has been reached. Initial reviews, follow-up reviews, and clinic responses have independent moderation states. Abuse reports remain a separate reasoned moderation queue.

Clinics may create one response. There is no clinic edit or delete command, and database guards prevent mutation of response authorship or content while still allowing an authorized moderator to change only its moderation status.
