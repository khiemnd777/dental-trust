# Incident response

## Severity

| Severity | Examples                                                                                                      | Initial action                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| SEV-1    | Active cross-tenant/medical data exposure, payment compromise, destructive integrity event, widespread outage | Page incident lead/security immediately; contain and preserve evidence |
| SEV-2    | Privileged account compromise, material provider outage, growing queue/data-processing failure                | Assign lead urgently; limit affected capability and investigate        |
| SEV-3    | Degraded non-critical feature, bounded failed jobs/webhooks, low-risk defect                                  | Track owner/SLA and monitor for escalation                             |
| SEV-4    | Cosmetic/documentation/low-risk operational issue                                                             | Normal backlog with evidence                                           |

## Response lifecycle

1. **Detect and declare:** create a private incident record with UTC timeline, reporter, symptoms, affected services/tenants/regions, suspected data classes, current version, and incident lead.
2. **Contain:** revoke sessions/credentials, disable the narrow feature/provider, block abusive sources, pause workers/webhooks or make storage read-only when justified. Do not destroy evidence.
3. **Investigate:** correlate request/audit/provider/CI logs by safe IDs; snapshot relevant immutable logs/config/version metadata; maintain chain of custody.
4. **Eradicate and recover:** patch root cause, rotate scoped secrets/keys, restore/reconcile data, deploy from a verified commit, and run functional plus negative security checks.
5. **Communicate:** legal/privacy owners determine patient, clinic, regulator, insurer, and provider notices and deadlines. Engineering does not invent or delay legal obligations.
6. **Close:** document scope, root cause, contributing controls, timeline, user impact, evidence, corrective owners/deadlines, and detection/response improvements.

## High-risk playbooks

**Cross-tenant access:** disable the path, preserve access/audit logs, identify exact records/actors/time window, invalidate relevant signed URLs/sessions, test alternate enumeration paths, and involve privacy counsel.

**Stripe/webhook anomaly:** block affected mutation, preserve raw provider event IDs/signature outcomes without secrets, reconcile provider ledger to local ledger, rotate webhook secret if exposed, and never synthesize successful payments.

**Malicious file:** keep object quarantined, revoke links, identify access/conversion events, preserve hash/sample under security handling, update signatures/policy, and rescan related objects.

**Credential/key exposure:** revoke/rotate at provider, invalidate derived sessions/tokens, scan history/artifacts/logs, evaluate encrypted data exposure, and re-encrypt by versioned migration when a field key is affected.

**Queue storm:** stop consumers or isolate the job type, retain dedupe/outbox state, fix idempotency/root cause, replay a bounded cohort, and monitor queue age/provider rate/cost.

## Evidence and communications

Use UTC. Never put patient data, credentials, full payment payloads, or private files into general chat/tickets. Maintain one approved status channel and update cadence. Public statements require incident/legal/comms approval.
