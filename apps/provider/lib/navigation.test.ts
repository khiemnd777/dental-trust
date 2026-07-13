import { describe, expect, it } from 'vitest';
import { isProviderPath, providerNavigation } from './navigation';

describe('Provider information architecture', () => {
  it('contains clinic workflow destinations only', () => {
    expect(providerNavigation.map(({ label }) => label)).toEqual([
      'Hôm nay',
      'Hồ sơ',
      'Lịch',
      'Tin nhắn',
      'Phòng khám',
    ]);
    expect(isProviderPath('/cases/example')).toBe(true);
    expect(isProviderPath('/admin/users')).toBe(false);
  });
});
