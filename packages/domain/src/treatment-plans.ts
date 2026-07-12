import { createHash } from 'node:crypto';

import { DomainRuleError } from './errors.js';

export interface TreatmentPlanSnapshot {
  readonly id: string;
  readonly version: number;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  readonly clinicId: string;
  readonly dentistId: string;
  readonly currency: 'VND' | 'USD';
  readonly totalMinor: number;
  readonly content: Readonly<Record<string, unknown>>;
  readonly publishedAt?: Date;
  readonly contentChecksum?: string;
}

export function publishTreatmentPlan(
  plan: TreatmentPlanSnapshot,
  publishedAt = new Date(),
): TreatmentPlanSnapshot {
  if (plan.status !== 'DRAFT') {
    throw new DomainRuleError(
      'TREATMENT_PLAN_IMMUTABLE',
      'Only a draft treatment plan can be published.',
      { planId: plan.id, status: plan.status },
    );
  }
  if (!Number.isInteger(plan.version) || plan.version < 1 || plan.totalMinor <= 0) {
    throw new DomainRuleError(
      'TREATMENT_PLAN_INCOMPLETE',
      'A treatment plan requires a positive version and total before publication.',
      { planId: plan.id },
    );
  }

  const immutableContent = {
    clinicId: plan.clinicId,
    dentistId: plan.dentistId,
    version: plan.version,
    currency: plan.currency,
    totalMinor: plan.totalMinor,
    content: plan.content,
  };

  return {
    ...plan,
    status: 'PUBLISHED',
    publishedAt,
    contentChecksum: createHash('sha256').update(stableJson(immutableContent)).digest('hex'),
  };
}

export function assertNewTreatmentPlanVersion(
  previous: TreatmentPlanSnapshot,
  next: TreatmentPlanSnapshot,
): void {
  if (previous.status !== 'PUBLISHED' && previous.status !== 'SUPERSEDED') {
    throw new DomainRuleError(
      'TREATMENT_PLAN_VERSION_SOURCE_INVALID',
      'A new version can only derive from a published plan.',
      { planId: previous.id, status: previous.status },
    );
  }
  if (next.id === previous.id || next.version !== previous.version + 1 || next.status !== 'DRAFT') {
    throw new DomainRuleError(
      'TREATMENT_PLAN_VERSION_INVALID',
      'A revision must be a new draft record with the next sequential version.',
      { previousPlanId: previous.id, nextPlanId: next.id },
    );
  }
  if (next.clinicId !== previous.clinicId || next.dentistId !== previous.dentistId) {
    throw new DomainRuleError(
      'TREATMENT_PLAN_AUTHORSHIP_CHANGED',
      'A treatment plan revision must retain its clinic and authoring dentist.',
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
