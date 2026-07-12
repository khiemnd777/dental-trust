import { describe, expect, it } from 'vitest';

import { formatDate, getMessages } from '@dental-trust/i18n';

describe('trust and safety localization', () => {
  it('provides the exact incident and review labels in English and Vietnamese', () => {
    const english = getMessages('en').trustSafety;
    const vietnamese = getMessages('vi').trustSafety;

    expect(english.incidentTypes.PAIN_OR_SYMPTOMS).toBe('Pain or unexpected symptoms');
    expect(vietnamese.incidentTypes.PAIN_OR_SYMPTOMS).toBe('Đau hoặc triệu chứng bất thường');
    expect(english.cleanlinessEnvironment).toBe('Cleanliness and environment');
    expect(vietnamese.cleanlinessEnvironment).toBe('Vệ sinh và môi trường');
    expect(english.followUpReview).toBe('Submit a follow-up review');
    expect(vietnamese.followUpReview).toBe('Gửi đánh giá theo dõi');
  });

  it('formats trust and safety dates with the selected locale', () => {
    const date = '2026-07-12T08:00:00.000Z';
    expect(formatDate('en', date)).toMatch(/Jul/u);
    expect(formatDate('vi', date)).toMatch(/thg 7/u);
    expect(formatDate('en', date)).not.toBe(formatDate('vi', date));
  });
});
