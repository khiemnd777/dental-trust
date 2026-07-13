import { describe, expect, it } from 'vitest';
import { areaForPath, operationsNavigation } from './navigation';
describe('Operations boundaries', () => {
  it('keeps three explicit operating areas', () => {
    expect(operationsNavigation.slice(1).map(({ label }) => label)).toEqual([
      'Điều phối',
      'Xác minh',
      'Quản trị',
    ]);
    expect(areaForPath('/verification/cases')).toBe('verification');
    expect(areaForPath('/provider/cases')).toBeNull();
  });
});
