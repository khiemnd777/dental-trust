import { describe, expect, it } from 'vitest';

import { assertPlanChangeFieldsMatchKind, canonicalPassportContent } from '../src/passport.js';

describe('journey and passport invariants', () => {
  it('canonicalizes object keys without changing clinically meaningful array order', () => {
    expect(canonicalPassportContent({ z: 1, nested: { b: 2, a: 'x' }, items: [2, 1] })).toBe(
      '{"items":[2,1],"nested":{"a":"x","b":2},"z":1}',
    );
  });

  it('requires plan change content to match the declared kind', () => {
    expect(() => assertPlanChangeFieldsMatchKind('PRICE', ['TOTAL_PRICE_MINOR'])).not.toThrow();
    expect(() => assertPlanChangeFieldsMatchKind('PRICE', ['PROCEDURE'])).toThrow();
    expect(() =>
      assertPlanChangeFieldsMatchKind('TREATMENT_AND_PRICE', ['PROCEDURE', 'CURRENCY']),
    ).not.toThrow();
    expect(() => assertPlanChangeFieldsMatchKind('TREATMENT_AND_PRICE', ['PROCEDURE'])).toThrow();
  });
});
