import { DomainRuleError } from './errors.js';

export const incidentTypes = [
  'PAIN_OR_SYMPTOMS',
  'TREATMENT_CONCERN',
  'BILLING_DISPUTE',
  'SERVICE_COMPLAINT',
  'RECORD_CORRECTION',
  'PRIVACY_CONCERN',
  'WARRANTY_CLAIM',
] as const;
export type IncidentType = (typeof incidentTypes)[number];

export const incidentEventKinds = [
  'INCIDENT_SUBMITTED',
  'WARRANTY_CLAIM_SUBMITTED',
  'PATIENT_UPDATE',
  'CLINIC_RESPONSE',
  'INTERNAL_NOTE',
  'INCIDENT_ESCALATED',
  'RESOLUTION_PROPOSED',
  'STATUS_TRIAGED',
  'STATUS_IN_PROGRESS',
  'STATUS_AWAITING_CLINIC',
  'STATUS_RESOLVED',
  'STATUS_CLOSED',
  'STATUS_REOPENED',
] as const;
export type IncidentEventKind = (typeof incidentEventKinds)[number];

const severityRank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;

export function assertIncidentEscalation(
  currentSeverity: keyof typeof severityRank,
  escalatedSeverity: keyof typeof severityRank,
): void {
  if (
    severityRank[escalatedSeverity] <= severityRank[currentSeverity] ||
    severityRank[escalatedSeverity] < severityRank.HIGH
  ) {
    throw new DomainRuleError(
      'INVALID_INCIDENT_ESCALATION',
      'An escalation must raise the incident to high or critical severity.',
    );
  }
}
