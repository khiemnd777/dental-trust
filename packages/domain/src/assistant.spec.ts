import { describe, expect, it } from 'vitest';

import {
  classifyAssistantSafety,
  normalizeAssistantAction,
  permittedAssistantActions,
} from './assistant.js';

describe('care assistant safety and action policy', () => {
  it('routes emergency signals away from model-led actions', () => {
    expect(classifyAssistantSafety('Tôi bị sưng lan nhanh ở cổ và khó thở')).toBe('URGENT');
    expect(
      normalizeAssistantAction(
        'OPEN_BOOKING',
        { hasCase: true, hasAppointment: false, hasCheckoutOption: true },
        'URGENT',
      ),
    ).toBe('EMERGENCY_CARE');
  });

  it('only permits booking when a server-side checkout option exists', () => {
    expect(
      permittedAssistantActions(
        { hasCase: true, stage: 'BOOKING', hasAppointment: false, hasCheckoutOption: false },
        'ROUTINE',
      ).has('OPEN_BOOKING'),
    ).toBe(false);
    expect(
      permittedAssistantActions(
        { hasCase: true, stage: 'BOOKING', hasAppointment: false, hasCheckoutOption: true },
        'ROUTINE',
      ).has('OPEN_BOOKING'),
    ).toBe(true);
  });

  it('allows starting a request only before a case exists', () => {
    expect(
      normalizeAssistantAction(
        'START_REQUEST',
        { hasCase: true, stage: 'MATCHING', hasAppointment: false, hasCheckoutOption: false },
        'ROUTINE',
      ),
    ).toBe('NONE');
  });
});
