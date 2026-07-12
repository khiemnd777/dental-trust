import { DomainRuleError } from './errors.js';

export const incidentSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IncidentSeverity = (typeof incidentSeverities)[number];

export const incidentStatuses = [
  'OPEN',
  'TRIAGED',
  'IN_PROGRESS',
  'AWAITING_CLINIC',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];

const incidentTransitions: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  OPEN: ['TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  TRIAGED: ['IN_PROGRESS', 'AWAITING_CLINIC', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['AWAITING_CLINIC', 'RESOLVED', 'CLOSED'],
  AWAITING_CLINIC: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
};

export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus): void {
  if (!incidentTransitions[from].includes(to)) {
    throw new DomainRuleError(
      'INVALID_INCIDENT_TRANSITION',
      `Incident status cannot move from ${from} to ${to}.`,
    );
  }
}

const incidentSlaMilliseconds: Readonly<Record<IncidentSeverity, number>> = {
  CRITICAL: 60 * 60_000,
  HIGH: 4 * 60 * 60_000,
  MEDIUM: 24 * 60 * 60_000,
  LOW: 72 * 60 * 60_000,
};

export function incidentSlaDueAt(severity: IncidentSeverity, openedAt = new Date()): Date {
  return new Date(openedAt.getTime() + incidentSlaMilliseconds[severity]);
}

export const privacyRequestStatuses = [
  'SUBMITTED',
  'IDENTITY_VERIFICATION_REQUIRED',
  'IN_REVIEW',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export type PrivacyRequestStatus = (typeof privacyRequestStatuses)[number];

const privacyTransitions: Readonly<Record<PrivacyRequestStatus, readonly PrivacyRequestStatus[]>> =
  {
    SUBMITTED: ['IDENTITY_VERIFICATION_REQUIRED', 'IN_REVIEW', 'CANCELLED'],
    IDENTITY_VERIFICATION_REQUIRED: ['IN_REVIEW', 'REJECTED', 'CANCELLED'],
    IN_REVIEW: ['IDENTITY_VERIFICATION_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['IN_REVIEW', 'COMPLETED'],
    COMPLETED: [],
    REJECTED: [],
    CANCELLED: [],
  };

export function assertPrivacyRequestTransition(
  from: PrivacyRequestStatus,
  to: PrivacyRequestStatus,
): void {
  if (!privacyTransitions[from].includes(to)) {
    throw new DomainRuleError(
      'INVALID_PRIVACY_REQUEST_TRANSITION',
      `Privacy request status cannot move from ${from} to ${to}.`,
    );
  }
}

export const supportCapabilities = [
  'CASE_READ',
  'INCIDENT_READ',
  'INCIDENT_UPDATE',
  'PRIVACY_STATUS_READ',
] as const;
export type SupportCapability = (typeof supportCapabilities)[number];
