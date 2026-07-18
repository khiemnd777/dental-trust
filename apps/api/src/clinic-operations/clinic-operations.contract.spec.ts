import { describe, expect, it } from 'vitest';

import {
  appointmentAvailabilityQuerySchema,
  clinicAnalyticsViewSchema,
  createAppointmentRequestSchema,
  createAvailabilityBlockRequestSchema,
  publishClinicServiceRequestSchema,
  upsertClinicLocationRequestSchema,
} from '@dental-trust/contracts';

const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const locationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';

describe('clinic operations contracts', () => {
  it('requires an active location reference for clinical appointment commands and checks', () => {
    const window = {
      clinicId,
      dentistId,
      kind: 'CLINICAL_VISIT',
      startsAt: '2026-12-01T02:00:00.000Z',
      endsAt: '2026-12-01T03:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
    };
    expect(createAppointmentRequestSchema.safeParse(window).success).toBe(false);
    expect(appointmentAvailabilityQuerySchema.safeParse(window).success).toBe(false);
    expect(
      createAppointmentRequestSchema.safeParse({ ...window, clinicLocationId: locationId }).success,
    ).toBe(true);
  });

  it('requires a dentist or location scope for blocked time', () => {
    expect(
      createAvailabilityBlockRequestSchema.safeParse({
        kind: 'BLOCK',
        startsAt: '2026-12-01T02:00:00.000Z',
        endsAt: '2026-12-01T03:00:00.000Z',
        reason: 'Maintenance window',
      }).success,
    ).toBe(false);
    expect(
      createAvailabilityBlockRequestSchema.safeParse({
        locationId,
        kind: 'BLOCK',
        startsAt: '2026-12-01T02:00:00.000Z',
        endsAt: '2026-12-01T03:00:00.000Z',
        reason: 'Maintenance window',
      }).success,
    ).toBe(true);
  });

  it('accepts complete clinic coordinates and rejects out-of-range map positions', () => {
    const location = {
      name: 'Main clinic',
      address: '1 Nguyen Hue Street',
      city: 'Ho Chi Minh City',
      timezone: 'Asia/Ho_Chi_Minh',
      businessContact: {
        email: 'clinic@example.com',
        phone: '+842812345678',
        contactName: 'Clinic Team',
      },
      active: true,
    };
    expect(
      upsertClinicLocationRequestSchema.safeParse({
        ...location,
        coordinates: { latitude: 10.776, longitude: 106.7 },
      }).success,
    ).toBe(true);
    expect(
      upsertClinicLocationRequestSchema.safeParse({
        ...location,
        coordinates: { latitude: 91, longitude: 106.7 },
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted clinic price range before persistence', () => {
    const result = publishClinicServiceRequestSchema.safeParse({
      procedureDefinitionId: clinicId,
      displayNames: { 'vi-VN': 'Implant', 'en-US': 'Implant' },
      includedServices: ['Consultation'],
      exclusions: ['Travel'],
      estimatedDurationDays: 7,
      warrantyPolicy: { name: 'Warranty', terms: { duration: '5 years' } },
      minimumMinor: 200,
      maximumMinor: 100,
      currency: 'USD',
      materialOptions: ['Titanium'],
      brandOptions: ['Brand A'],
      effectiveAt: '2026-12-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts the complete tenant-safe analytics response without placeholder metrics', () => {
    expect(
      clinicAnalyticsViewSchema.safeParse({
        generatedAt: '2026-07-12T08:00:00.000Z',
        periodDays: 90,
        metrics: {
          newCases: 1,
          averageResponseHours: 2,
          averagePlanCompletionHours: 24,
          consultationConversionRate: 0.5,
          bookingConversionRate: 0.4,
          treatmentCompletionRate: 0.9,
          averageCostVarianceRate: 0.02,
          averageScheduleVarianceHours: 1,
          incidentRate: 0,
          warrantyRate: 0,
          verifiedReviewCount: 10,
          averageVerifiedRating: 4.8,
          aftercareResponseSlaRate: 0.95,
          nextVerificationExpiry: '2027-01-01',
        },
        paymentSummaries: [{ currency: 'VND', count: 1, grossAmountMinor: 1000 }],
        unavailableMetrics: [],
      }).success,
    ).toBe(true);
  });
});
