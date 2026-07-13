import { describe, expect, it } from 'vitest';

import { careNavigation, isCarePath } from './navigation';

describe('Care information architecture', () => {
  it('keeps exactly five consumer destinations', () => {
    expect(careNavigation.map(({ label }) => label)).toEqual([
      'Hôm nay',
      'Khám phá',
      'Hành trình',
      'Tin nhắn',
      'Tài khoản',
    ]);
  });

  it('rejects provider and operations paths', () => {
    expect(isCarePath('/discover/clinics')).toBe(true);
    expect(isCarePath('/admin')).toBe(false);
    expect(isCarePath('/verification')).toBe(false);
  });
});
