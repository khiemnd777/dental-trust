import { DomainRuleError } from './errors.js';

const priceFields = new Set(['UNIT_PRICE_MINOR', 'TOTAL_PRICE_MINOR', 'CURRENCY']);

export function assertPlanChangeFieldsMatchKind(
  kind: 'TREATMENT' | 'PRICE' | 'TREATMENT_AND_PRICE',
  fields: readonly string[],
): void {
  const hasPrice = fields.some((field) => priceFields.has(field));
  const hasTreatment = fields.some((field) => !priceFields.has(field));
  if (kind === 'PRICE' && hasTreatment) {
    throw new DomainRuleError(
      'PLAN_CHANGE_KIND_MISMATCH',
      'Price changes cannot contain treatment fields.',
    );
  }
  if (kind === 'TREATMENT' && hasPrice) {
    throw new DomainRuleError(
      'PLAN_CHANGE_KIND_MISMATCH',
      'Treatment changes cannot contain price fields.',
    );
  }
  if (kind === 'TREATMENT_AND_PRICE' && (!hasPrice || !hasTreatment)) {
    throw new DomainRuleError(
      'PLAN_CHANGE_KIND_MISMATCH',
      'Combined changes require both treatment and price fields.',
    );
  }
}

export function canonicalPassportContent(value: Readonly<Record<string, unknown>>): string {
  return stableJson(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new DomainRuleError('PASSPORT_INVALID_NUMBER', 'Passport numbers must be finite.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  throw new DomainRuleError(
    'PASSPORT_UNSUPPORTED_VALUE',
    'Passport content contains an unsupported value.',
  );
}
