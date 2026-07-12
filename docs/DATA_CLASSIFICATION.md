# Data classification and handling

## Purpose and status

This standard classifies Dental Trust data and defines minimum engineering controls. It is an
implementation baseline, not a legal determination or certification. Privacy counsel, clinical
governance, security, and each operating market must approve the production inventory, retention
schedule, subprocessors, transfer mechanism, and incident obligations before launch.

## Classification levels

| Level        | Examples                                                                                                                                                                                                                                                  | Minimum handling                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public       | Published clinic profiles, approved verification claims, public service guidance, published consent-free content                                                                                                                                          | Integrity controls, approved publication workflow, source and expiry tracking where claims are time-bound                                                                                                                         |
| Internal     | Non-sensitive runbooks, aggregate service metrics, feature configuration, public-content drafts                                                                                                                                                           | Authenticated workforce access, least privilege, change history, approved work systems only                                                                                                                                       |
| Confidential | Account identity and contact data, organization membership, commercial terms, invoices, non-clinical support requests, security metadata                                                                                                                  | Encryption in transit and at rest, scoped access, retention limit, safe logs, audited administrative access                                                                                                                       |
| Restricted   | Medical history, dental records and images, treatment plans, diagnoses supplied by providers, prescriptions, private messages, aftercare responses, incidents, passport data, credentials, MFA secrets, session/token material, raw payment-provider data | Minimum-necessary access, explicit resource authorization, application encryption for selected fields, private object storage, short-lived links, access audit, production-only approved systems, no content in logs or analytics |

Payment card numbers and security codes must never enter Dental Trust application storage. The
configured payment provider collects them in its hosted or tokenized surface. Provider tokens and
webhook bodies are Restricted even when they do not contain full card data.

## Data inventory and ownership

| Domain                                | Typical classification                                            | System of record                                                      | Primary owner                         |
| ------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| Public clinic/dentist evidence        | Public after approval; Confidential while under review            | PostgreSQL and private evidence objects                               | Verification lead                     |
| Identity, sessions, MFA, recovery     | Confidential to Restricted                                        | PostgreSQL; secrets stored only as hashes or authenticated ciphertext | Security/identity owner               |
| Patient profile and questionnaire     | Restricted                                                        | PostgreSQL authenticated ciphertext for selected fields               | Privacy and clinical operations       |
| Case files and clinical media         | Restricted                                                        | Private object storage plus PostgreSQL metadata                       | Patient and assigned clinical team    |
| Plans, consent, journey, passport     | Restricted                                                        | PostgreSQL; generated documents in private object storage             | Treating provider and care operations |
| Messages, aftercare, incidents        | Restricted                                                        | PostgreSQL authenticated ciphertext where designated                  | Care operations and clinical safety   |
| Payments, refunds, reconciliation     | Confidential; provider secrets/raw events Restricted              | PostgreSQL plus payment provider                                      | Finance owner                         |
| Audit, security, and operational logs | Confidential; may become Restricted if linked to sensitive access | Append-oriented PostgreSQL and approved log platform                  | Security/operations                   |
| Aggregate analytics                   | Internal or Confidential depending on re-identification risk      | Approved analytics store                                              | Product/data owner                    |

Every new field, event payload, file category, log attribute, analytics property, export, or provider
integration must identify its classification and owner during review. Unknown patient-related data
defaults to Restricted.

## Collection and minimization

- Collect only data needed for a documented care-coordination, security, payment, verification, or
  legal purpose.
- Use structured fields and controlled categories when they reduce accidental disclosure in free
  text.
- State purpose and sharing context at collection. Consent records are immutable and versioned.
- Do not copy Restricted content into tickets, chat, email, source control, test fixtures, prompt
  inputs, dashboards, or analytics unless that destination is specifically approved for it.
- Production data is prohibited in local development and automated tests. Seed identities and
  records must be synthetic and visibly development-only.

## Access and authorization

- Enforce identity, role, active organization membership, selected tenant, resource ownership or
  assignment, and explicit caregiver permission at every request and repository boundary.
- Verification and content roles cannot read unrelated patient records. Finance roles receive only
  the minimum transaction context. Support access to sensitive data requires an MFA-backed,
  reasoned, expiring elevation that is visible and audited.
- Signed object and passport-share URLs must be short-lived, revocable, opaque, and checked against
  current authorization. Public QR codes contain only such a share URL, never patient data.
- Access to Restricted content is logged with actor, action, resource, tenant, request identifier,
  outcome, and reason where privileged. Audit metadata must not reproduce the content accessed.

## Storage, transport, and keys

- TLS is mandatory across public and service connections in production. Database, queue, object,
  email, and provider endpoints must use production-approved encrypted transport.
- Restricted files remain private and quarantined until signature, MIME, size, and malware checks
  pass. Backups inherit the highest classification they contain.
- Selected sensitive text uses authenticated application encryption with resource-bound additional
  authenticated data. Hash lookup secrets with a one-way cryptographic hash; do not encrypt raw
  session or lifecycle tokens for routine lookup.
- Encryption keys and provider secrets live in the deployment secret manager, are separated by
  environment and purpose, have named owners, and follow the rotation/recovery procedure in
  [SECURITY.md](SECURITY.md) and [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Key loss and suspected key
  disclosure are security incidents.

## Logging, telemetry, and diagnostics

Never log passwords, authentication or recovery tokens, raw payment data, private file contents,
full questionnaire responses, encryption keys, signed URLs, symptoms, diagnoses, patient notes, or
sensitive message bodies. Structured log redaction is defense in depth, not permission to pass
sensitive objects to a logger.

Browser error telemetry sends only a validated framework digest and coarse route family. Logs may
use safe opaque identifiers for correlation, but operators must not paste Restricted content into
search tools. Error responses use stable codes and request identifiers without internal details.

## Sharing and cross-border transfer

- Share the minimum necessary data only with the clinic, dentist, caregiver, processor, or operator
  authorized for the case and purpose.
- Record the recipient, scope, purpose, time, expiry, and revocation state. Re-check authorization on
  access instead of relying on an old link or cached role.
- Production launch requires approved processor agreements, regional notices, transfer mechanism,
  localization requirements, and a current subprocessor inventory for each market.
- Email and notification content must not contain clinical detail; it links the authenticated user
  back to the platform.

## Retention, export, and deletion

The configurable retention schedule must distinguish account, clinical, financial, verification,
audit, security, and support obligations. A deletion request does not silently remove records that
must be retained for patient safety, legal claims, fraud prevention, accounting, or clinical record
duties; the response explains any lawful restriction. Expired data is securely deleted or
irreversibly de-identified, including derived search and analytics copies. Backups expire through
their controlled lifecycle rather than ad hoc record editing.

Exports require identity verification, authorization, a complete audit event, encrypted packaging,
short-lived delivery, and expiry. They must not include another tenant's records, internal-only
notes, secrets, raw provider payloads, or data outside the approved request scope.

## Incident handling and review

Suspected misclassification, unauthorized access, cross-tenant disclosure, lost device/export,
misdirected notification, leaked signed URL, or key/provider compromise follows
[INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md). Preserve evidence without copying Restricted content
into unapproved systems. Security and privacy owners review this standard at least annually and
whenever a new market, clinical workflow, provider, data store, or regulatory obligation is added.
