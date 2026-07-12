export interface AftercareEscalationRule {
  readonly id: string;
  readonly enabled: boolean;
  readonly painThreshold?: number;
  readonly symptomCodes: readonly string[];
  readonly severity: 'URGENT' | 'HIGH' | 'ROUTINE';
  readonly emergencyGuidanceKey: string;
}

export interface AftercareCheckInFacts {
  readonly painScale: number;
  readonly symptomCodes: readonly string[];
}

export interface AftercareEscalationDecision {
  readonly escalate: boolean;
  readonly matchedRuleIds: readonly string[];
  readonly highestSeverity?: AftercareEscalationRule['severity'];
  readonly guidanceKeys: readonly string[];
  readonly requiresLicensedProviderContact: boolean;
}

const severityOrder: Readonly<Record<AftercareEscalationRule['severity'], number>> = {
  ROUTINE: 1,
  HIGH: 2,
  URGENT: 3,
};

export function evaluateAftercareEscalation(
  checkIn: AftercareCheckInFacts,
  rules: readonly AftercareEscalationRule[],
): AftercareEscalationDecision {
  const matched = rules.filter(
    (rule) =>
      rule.enabled &&
      ((rule.painThreshold !== undefined && checkIn.painScale >= rule.painThreshold) ||
        rule.symptomCodes.some((code) => checkIn.symptomCodes.includes(code))),
  );

  const highestSeverity = matched
    .map(({ severity }) => severity)
    .sort((left, right) => severityOrder[right] - severityOrder[left])[0];

  return {
    escalate: matched.length > 0,
    matchedRuleIds: matched.map(({ id }) => id),
    ...(highestSeverity ? { highestSeverity } : {}),
    guidanceKeys: [...new Set(matched.map(({ emergencyGuidanceKey }) => emergencyGuidanceKey))],
    requiresLicensedProviderContact: matched.length > 0,
  };
}
