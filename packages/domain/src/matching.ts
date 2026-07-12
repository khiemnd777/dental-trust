import { DomainRuleError } from './errors.js';

export const matchingAlgorithmVersion = 'organic-v1';

export type CaseComplexityCategory = 'UNKNOWN' | 'STANDARD' | 'COMPLEX';
export type ConciergePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface OrganicMatchingCriteria {
  readonly procedureCode: string;
  readonly preferredCity?: string;
  readonly preferredDistrict?: string;
  readonly arrivalDate?: string;
  readonly departureDate?: string;
  readonly preferredLanguages: readonly string[];
  readonly budgetMinimumMinor?: number;
  readonly budgetMaximumMinor?: number;
  readonly budgetCurrency?: 'VND' | 'USD';
  readonly complexityCategory: CaseComplexityCategory;
  readonly requiresAftercare: boolean;
  readonly requiresWarranty: boolean;
  readonly accessibilityNeeds: readonly string[];
  readonly preferredEquipment: readonly string[];
}

export interface OrganicClinicCandidate {
  readonly clinicId: string;
  readonly verifiedProcedureCodes: readonly string[];
  readonly cities: readonly string[];
  readonly districts: readonly string[];
  readonly earliestConsultationDate?: string;
  readonly languages: readonly string[];
  readonly minimumPriceMinor?: number;
  readonly maximumPriceMinor?: number;
  readonly priceCurrency?: 'VND' | 'USD';
  readonly supportedComplexities: readonly CaseComplexityCategory[];
  readonly aftercareSupported: boolean;
  readonly warrantySupported: boolean;
  readonly accessibilityFeatures: readonly string[];
  readonly equipment: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface OrganicMatchResult {
  readonly clinicId: string;
  readonly fitScore: number;
  readonly reasonCodes: readonly string[];
  readonly limitationCodes: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly algorithmVersion: typeof matchingAlgorithmVersion;
}

const weights = {
  procedure: 30,
  location: 12,
  availability: 10,
  language: 10,
  budget: 10,
  complexity: 8,
  aftercare: 7,
  warranty: 5,
  accessibility: 3,
  equipment: 5,
} as const;

export interface ClinicalMatchScoreInput {
  readonly clinicId: string;
  readonly procedureCapability: number;
  readonly locationFit: number;
  readonly availabilityFit: number;
  readonly languageFit: number;
  readonly budgetFit: number;
  readonly complexityFit: number;
  readonly aftercareFit: number;
  readonly warrantyFit: number;
  readonly evidenceIds: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * Compatibility scorer for already-normalized evidence inputs. The public ranking
 * path uses `rankOrganicClinicMatches`; this function deliberately rejects any
 * commercial signal so older callers keep the same non-advertising invariant.
 */
export function calculateClinicalMatch(input: ClinicalMatchScoreInput): {
  readonly clinicId: string;
  readonly fitScore: number;
  readonly evidenceIds: readonly string[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: typeof matchingAlgorithmVersion;
} {
  if ('commercialBoost' in input || 'sponsorship' in input || 'commission' in input) {
    throw new DomainRuleError(
      'MATCHING_COMMERCIAL_SIGNAL_FORBIDDEN',
      'Commercial payment or sponsorship signals cannot affect clinic matching.',
    );
  }
  const components: readonly [number, number][] = [
    [input.procedureCapability, weights.procedure],
    [input.locationFit, weights.location],
    [input.availabilityFit, weights.availability],
    [input.languageFit, weights.language],
    [input.budgetFit, weights.budget],
    [input.complexityFit, weights.complexity],
    [input.aftercareFit, weights.aftercare],
    [input.warrantyFit, weights.warranty],
  ];
  for (const [value] of components) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new DomainRuleError(
        'MATCHING_INVALID_NORMALIZED_SCORE',
        'Normalized matching inputs must be between 0 and 100.',
      );
    }
  }
  const denominator = components.reduce((total, [, weight]) => total + weight, 0);
  const fitScore = Math.round(
    components.reduce((total, [value, weight]) => total + value * weight, 0) / denominator,
  );
  return {
    clinicId: input.clinicId,
    fitScore,
    evidenceIds: [...new Set(input.evidenceIds)].sort(),
    limitations: [...input.limitations],
    algorithmVersion: matchingAlgorithmVersion,
  };
}

export function rankOrganicClinicMatches(
  criteria: OrganicMatchingCriteria,
  candidates: readonly OrganicClinicCandidate[],
): readonly OrganicMatchResult[] {
  assertMatchingCriteria(criteria);
  return candidates
    .map((candidate) => scoreCandidate(criteria, candidate))
    .sort(
      (left, right) =>
        right.fitScore - left.fitScore || left.clinicId.localeCompare(right.clinicId),
    );
}

export function assertRecommendationOverride(
  originalRank: number,
  displayedRank: number,
  reason: string | undefined,
): void {
  if (
    !Number.isInteger(originalRank) ||
    originalRank < 1 ||
    !Number.isInteger(displayedRank) ||
    displayedRank < 1
  ) {
    throw new DomainRuleError(
      'MATCHING_INVALID_RANK',
      'Recommendation ranks must be positive integers.',
    );
  }
  if (originalRank !== displayedRank && (!reason || reason.trim().length < 10)) {
    throw new DomainRuleError(
      'MATCHING_OVERRIDE_REASON_REQUIRED',
      'A documented reason is required when concierge display order differs from organic rank.',
    );
  }
}

export function conciergeSlaDueAt(priority: ConciergePriority, from = new Date()): Date {
  const hours =
    priority === 'URGENT' ? 2 : priority === 'HIGH' ? 8 : priority === 'NORMAL' ? 24 : 48;
  return new Date(from.getTime() + hours * 60 * 60_000);
}

function scoreCandidate(
  criteria: OrganicMatchingCriteria,
  candidate: OrganicClinicCandidate,
): OrganicMatchResult {
  let fitScore = 0;
  const reasonCodes: string[] = [];
  const limitationCodes: string[] = [];
  const procedureMatch = normalized(candidate.verifiedProcedureCodes).has(
    normalize(criteria.procedureCode),
  );
  if (procedureMatch) {
    fitScore += weights.procedure;
    reasonCodes.push('VERIFIED_PROCEDURE_CAPABILITY');
  } else {
    limitationCodes.push('PROCEDURE_CAPABILITY_NOT_VERIFIED');
  }

  const cities = normalized(candidate.cities);
  const districts = normalized(candidate.districts);
  if (criteria.preferredDistrict && districts.has(normalize(criteria.preferredDistrict))) {
    fitScore += weights.location;
    reasonCodes.push('PREFERRED_DISTRICT');
  } else if (criteria.preferredCity && cities.has(normalize(criteria.preferredCity))) {
    fitScore += 8;
    reasonCodes.push('PREFERRED_CITY');
  } else if (criteria.preferredCity || criteria.preferredDistrict) {
    limitationCodes.push('LOCATION_PREFERENCE_NOT_MET');
  } else {
    fitScore += 6;
    reasonCodes.push('LOCATION_FLEXIBLE');
  }

  if (candidate.earliestConsultationDate && criteria.departureDate) {
    if (
      candidate.earliestConsultationDate <= criteria.departureDate &&
      (!criteria.arrivalDate || candidate.earliestConsultationDate >= criteria.arrivalDate)
    ) {
      fitScore += weights.availability;
      reasonCodes.push('TRAVEL_WINDOW_AVAILABILITY');
    } else {
      limitationCodes.push('NO_RECORDED_TRAVEL_WINDOW_AVAILABILITY');
    }
  } else {
    limitationCodes.push('AVAILABILITY_DATA_UNAVAILABLE');
  }

  if (criteria.preferredLanguages.length === 0) {
    fitScore += 5;
    reasonCodes.push('LANGUAGE_FLEXIBLE');
  } else if (intersects(criteria.preferredLanguages, candidate.languages)) {
    fitScore += weights.language;
    reasonCodes.push('PREFERRED_LANGUAGE');
  } else {
    limitationCodes.push('PREFERRED_LANGUAGE_NOT_RECORDED');
  }

  const budgetScore = scoreBudget(criteria, candidate);
  fitScore += budgetScore.score;
  reasonCodes.push(...budgetScore.reasons);
  limitationCodes.push(...budgetScore.limitations);

  if (
    criteria.complexityCategory === 'UNKNOWN' ||
    candidate.supportedComplexities.includes(criteria.complexityCategory)
  ) {
    fitScore += criteria.complexityCategory === 'UNKNOWN' ? 4 : weights.complexity;
    reasonCodes.push(
      criteria.complexityCategory === 'UNKNOWN'
        ? 'COMPLEXITY_UNCLASSIFIED'
        : 'DECLARED_COMPLEXITY_SUPPORT',
    );
  } else {
    limitationCodes.push('COMPLEXITY_SUPPORT_NOT_RECORDED');
  }

  fitScore += scoreRequirement(
    criteria.requiresAftercare,
    candidate.aftercareSupported,
    weights.aftercare,
    'AFTERCARE_SUPPORTED',
    'AFTERCARE_SUPPORT_NOT_RECORDED',
    reasonCodes,
    limitationCodes,
  );
  fitScore += scoreRequirement(
    criteria.requiresWarranty,
    candidate.warrantySupported,
    weights.warranty,
    'WARRANTY_SUPPORTED',
    'WARRANTY_NOT_RECORDED',
    reasonCodes,
    limitationCodes,
  );
  fitScore += scoreListPreference(
    criteria.accessibilityNeeds,
    candidate.accessibilityFeatures,
    weights.accessibility,
    'ACCESSIBILITY_NEEDS_MET',
    'ACCESSIBILITY_NEEDS_NOT_RECORDED',
    reasonCodes,
    limitationCodes,
  );
  fitScore += scoreListPreference(
    criteria.preferredEquipment,
    candidate.equipment,
    weights.equipment,
    'PREFERRED_EQUIPMENT_RECORDED',
    'PREFERRED_EQUIPMENT_NOT_RECORDED',
    reasonCodes,
    limitationCodes,
  );

  if (!procedureMatch) fitScore = Math.min(fitScore, 49);
  return {
    clinicId: candidate.clinicId,
    fitScore: Math.max(0, Math.min(100, fitScore)),
    reasonCodes,
    limitationCodes,
    evidenceIds: [...new Set(candidate.evidenceIds)].sort(),
    algorithmVersion: matchingAlgorithmVersion,
  };
}

function scoreBudget(
  criteria: OrganicMatchingCriteria,
  candidate: OrganicClinicCandidate,
): { score: number; reasons: string[]; limitations: string[] } {
  if (
    criteria.budgetMaximumMinor === undefined ||
    criteria.budgetCurrency === undefined ||
    candidate.minimumPriceMinor === undefined ||
    candidate.maximumPriceMinor === undefined ||
    candidate.priceCurrency === undefined
  ) {
    return { score: 0, reasons: [], limitations: ['PRICE_DATA_UNAVAILABLE'] };
  }
  if (criteria.budgetCurrency !== candidate.priceCurrency) {
    return { score: 0, reasons: [], limitations: ['PRICE_CURRENCY_NOT_COMPARABLE'] };
  }
  const minimumBudget = criteria.budgetMinimumMinor ?? 0;
  const overlaps =
    candidate.minimumPriceMinor <= criteria.budgetMaximumMinor &&
    candidate.maximumPriceMinor >= minimumBudget;
  return overlaps
    ? { score: weights.budget, reasons: ['ESTIMATED_PRICE_OVERLAPS_BUDGET'], limitations: [] }
    : { score: 0, reasons: [], limitations: ['ESTIMATED_PRICE_OUTSIDE_BUDGET'] };
}

function scoreRequirement(
  required: boolean,
  supported: boolean,
  weight: number,
  reason: string,
  limitation: string,
  reasons: string[],
  limitations: string[],
): number {
  if (!required) return Math.ceil(weight / 2);
  if (supported) {
    reasons.push(reason);
    return weight;
  }
  limitations.push(limitation);
  return 0;
}

function scoreListPreference(
  desired: readonly string[],
  available: readonly string[],
  weight: number,
  reason: string,
  limitation: string,
  reasons: string[],
  limitations: string[],
): number {
  if (desired.length === 0) return Math.ceil(weight / 2);
  if (desired.every((item) => normalized(available).has(normalize(item)))) {
    reasons.push(reason);
    return weight;
  }
  limitations.push(limitation);
  return 0;
}

function assertMatchingCriteria(criteria: OrganicMatchingCriteria): void {
  if (!criteria.procedureCode.trim()) {
    throw new DomainRuleError('MATCHING_PROCEDURE_REQUIRED', 'Matching requires a procedure code.');
  }
  if (
    criteria.budgetMinimumMinor !== undefined &&
    criteria.budgetMaximumMinor !== undefined &&
    criteria.budgetMaximumMinor < criteria.budgetMinimumMinor
  ) {
    throw new DomainRuleError(
      'MATCHING_BUDGET_RANGE_INVALID',
      'Maximum budget must not be below minimum budget.',
    );
  }
  if (
    criteria.arrivalDate &&
    criteria.departureDate &&
    criteria.departureDate < criteria.arrivalDate
  ) {
    throw new DomainRuleError(
      'MATCHING_TRAVEL_RANGE_INVALID',
      'Departure must not precede arrival.',
    );
  }
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightValues = normalized(right);
  return left.some((value) => rightValues.has(normalize(value)));
}

function normalized(values: readonly string[]): Set<string> {
  return new Set(values.map(normalize));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
