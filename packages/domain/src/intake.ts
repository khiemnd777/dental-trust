import { DomainRuleError } from './errors.js';

export const intakeConsentPurposes = [
  'INTAKE_HEALTH_INFORMATION',
  'INTAKE_MEDICAL_DISCLAIMER',
] as const;

export interface IntakeHealthItem {
  readonly key: string;
  readonly secondary?: string;
}

export interface IntakeSubmissionSnapshot {
  readonly desiredProcedureCode?: string;
  readonly dentalConcerns: readonly string[];
  readonly treatmentGoals: readonly string[];
  readonly currentCountry?: string;
  readonly currentCity?: string;
  readonly expectedArrivalDate?: string;
  readonly expectedDepartureDate?: string;
  readonly preferredLocation?: string;
  readonly availableTreatmentDays?: number;
  readonly budgetMinimumMinor?: number;
  readonly budgetMaximumMinor?: number;
  readonly budgetCurrency?: 'VND' | 'USD';
  readonly preferredLanguage?: string;
  readonly smokingStatus?: 'NEVER' | 'FORMER' | 'CURRENT' | 'PREFER_NOT_TO_SAY';
  readonly pregnancyStatus?:
    'NOT_APPLICABLE' | 'NOT_PREGNANT' | 'PREGNANT' | 'UNSURE' | 'PREFER_NOT_TO_SAY';
  readonly preferredConsultationTimes?: readonly {
    readonly weekday: number;
    readonly start: string;
    readonly end: string;
    readonly timezone: string;
  }[];
  readonly medicalConditions: readonly IntakeHealthItem[];
  readonly medications: readonly IntakeHealthItem[];
  readonly allergies: readonly IntakeHealthItem[];
  readonly consentPurposes: readonly string[];
}

export interface IntakeProgressInput extends IntakeSubmissionSnapshot {
  readonly hasDentalHistoryAnswer: boolean;
  readonly hasAccessibilityAnswer: boolean;
}

export interface IntakeProgress {
  readonly completedSteps: number;
  readonly totalSteps: 6;
  readonly percent: number;
  readonly nextStep: number;
}

export function validateIntakeSubmission(snapshot: IntakeSubmissionSnapshot): void {
  const missing: string[] = [];
  if (!snapshot.desiredProcedureCode?.trim()) missing.push('desiredProcedureCode');
  if (snapshot.dentalConcerns.length === 0) missing.push('dentalConcerns');
  if (snapshot.treatmentGoals.length === 0) missing.push('treatmentGoals');
  if (!snapshot.currentCountry?.trim()) missing.push('currentCountry');
  if (!snapshot.currentCity?.trim()) missing.push('currentCity');
  if (!snapshot.expectedArrivalDate) missing.push('expectedArrivalDate');
  if (!snapshot.expectedDepartureDate) missing.push('expectedDepartureDate');
  if (!snapshot.preferredLocation?.trim()) missing.push('preferredLocation');
  if (snapshot.availableTreatmentDays === undefined) missing.push('availableTreatmentDays');
  if (snapshot.budgetMinimumMinor === undefined) missing.push('budgetMinimumMinor');
  if (snapshot.budgetMaximumMinor === undefined) missing.push('budgetMaximumMinor');
  if (!snapshot.budgetCurrency) missing.push('budgetCurrency');
  if (!snapshot.preferredLanguage?.trim()) missing.push('preferredLanguage');
  if (!snapshot.smokingStatus) missing.push('smokingStatus');
  if (!snapshot.pregnancyStatus) missing.push('pregnancyStatus');
  if (!snapshot.preferredConsultationTimes?.length) missing.push('preferredConsultationTimes');
  if (missing.length > 0) {
    throw new DomainRuleError(
      'INTAKE_INCOMPLETE',
      'Complete all required intake steps before submitting.',
      { fields: missing.join(',') },
    );
  }

  const arrivalDate = required(snapshot.expectedArrivalDate, 'expectedArrivalDate');
  const departureDate = required(snapshot.expectedDepartureDate, 'expectedDepartureDate');
  const treatmentDays = required(snapshot.availableTreatmentDays, 'availableTreatmentDays');
  const budgetMinimum = required(snapshot.budgetMinimumMinor, 'budgetMinimumMinor');
  const budgetMaximum = required(snapshot.budgetMaximumMinor, 'budgetMaximumMinor');
  const consultationTimes = required(
    snapshot.preferredConsultationTimes,
    'preferredConsultationTimes',
  );
  if (arrivalDate > departureDate) {
    throw new DomainRuleError(
      'INTAKE_INVALID_TRAVEL_WINDOW',
      'Departure must be on or after arrival.',
    );
  }
  if (!Number.isInteger(treatmentDays) || treatmentDays < 1 || treatmentDays > 365) {
    throw new DomainRuleError(
      'INTAKE_INVALID_TREATMENT_DAYS',
      'Available treatment days must be between 1 and 365.',
    );
  }
  if (budgetMinimum < 0 || budgetMaximum < budgetMinimum) {
    throw new DomainRuleError('INTAKE_INVALID_BUDGET', 'The intake budget range is invalid.');
  }
  assertUnique(snapshot.dentalConcerns, 'dental concern');
  assertUnique(snapshot.treatmentGoals, 'treatment goal');
  assertUnique(
    snapshot.medicalConditions.map(({ key }) => key),
    'medical condition',
  );
  assertUnique(
    snapshot.medications.map(({ key }) => key.toLocaleLowerCase()),
    'medication',
  );
  assertUnique(
    snapshot.allergies.map(({ key }) => key.toLocaleLowerCase()),
    'allergy',
  );

  const purposes = new Set(snapshot.consentPurposes);
  if (
    intakeConsentPurposes.some((purpose) => !purposes.has(purpose)) ||
    purposes.size !== intakeConsentPurposes.length
  ) {
    throw new DomainRuleError(
      'INTAKE_CONSENT_REQUIRED',
      'Both current intake consent acknowledgements are required.',
    );
  }
  for (const time of consultationTimes) {
    if (
      !Number.isInteger(time.weekday) ||
      time.weekday < 0 ||
      time.weekday > 6 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time.end) ||
      time.start >= time.end ||
      !time.timezone.trim()
    ) {
      throw new DomainRuleError(
        'INTAKE_INVALID_CONSULTATION_TIME',
        'Preferred consultation times must contain valid local time windows.',
      );
    }
  }
}

export function intakeProgress(input: IntakeProgressInput): IntakeProgress {
  const steps = [
    Boolean(
      input.desiredProcedureCode?.trim() &&
      input.dentalConcerns.length &&
      input.treatmentGoals.length,
    ),
    Boolean(
      input.currentCountry?.trim() &&
      input.currentCity?.trim() &&
      input.expectedArrivalDate &&
      input.expectedDepartureDate &&
      input.preferredLocation?.trim() &&
      input.availableTreatmentDays,
    ),
    Boolean(
      input.budgetMinimumMinor !== undefined &&
      input.budgetMaximumMinor !== undefined &&
      input.budgetCurrency &&
      input.preferredLanguage?.trim() &&
      input.preferredConsultationTimes?.length,
    ),
    input.hasDentalHistoryAnswer,
    Boolean(input.smokingStatus && input.pregnancyStatus && input.hasAccessibilityAnswer),
    intakeConsentPurposes.every((purpose) => input.consentPurposes.includes(purpose)),
  ];
  const completedSteps = steps.filter(Boolean).length;
  const nextIndex = steps.findIndex((complete) => !complete);
  return {
    completedSteps,
    totalSteps: 6,
    percent: Math.round((completedSteps / 6) * 100),
    nextStep: nextIndex < 0 ? 6 : nextIndex + 1,
  };
}

export function canonicalIntakeSnapshot<T>(value: T): T {
  return canonicalize(value) as T;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(canonicalize);
    return normalized.every((item) => typeof item === 'string')
      ? [...normalized].sort()
      : normalized;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return typeof value === 'string' ? value.trim() : value;
}

function assertUnique(values: readonly string[], label: string): void {
  const normalized = values.map((value) => value.trim().toLocaleLowerCase());
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
    throw new DomainRuleError(
      'INTAKE_DUPLICATE_OR_EMPTY_ITEM',
      `Each ${label} must be non-empty and unique.`,
    );
  }
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new DomainRuleError('INTAKE_INCOMPLETE', 'Required intake data is missing.', { field });
  }
  return value;
}
