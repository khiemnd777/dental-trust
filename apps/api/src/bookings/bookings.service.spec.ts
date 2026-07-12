import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import type { BookingRecord, PrismaClient } from '@dental-trust/database';

import type { PaymentsService } from '../payments/payments.service.js';
import { BookingsService } from './bookings.service.js';

const patientAccess: AccessContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  roles: ['PATIENT'],
  memberships: [],
  mfaVerified: false,
  requestId: 'booking-test-request',
};

describe('BookingsService boundary', () => {
  it('creates checkout from the exact acceptance and stale-preview evidence before payment', async () => {
    const createDepositIntent = vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000020',
      bookingId: '00000000-0000-4000-8000-000000000021',
      caseId: '00000000-0000-4000-8000-000000000022',
      provider: 'development',
      providerPaymentIntentId: 'dev_intent',
      amountMinor: '50000',
      currency: 'USD',
      status: 'REQUIRES_ACTION',
      version: 2,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
      refunds: [],
      clientSecret: null,
    });
    const service = new BookingsService(
      {} as PrismaClient,
      { createDepositIntent } as unknown as PaymentsService,
    );
    const record = bookingRecord();
    const createFromAcceptance = vi.fn().mockResolvedValue(record);
    Object.defineProperty(service, 'bookings', {
      value: {
        createFromAcceptance,
        requireById: vi.fn().mockResolvedValue(record),
      },
    });
    const acceptanceId = record.treatmentPlanAcceptanceId;

    await service.checkout(
      patientAccess,
      {
        treatmentPlanAcceptanceId: acceptanceId,
        expectedDepositBasisPoints: 2000,
        expectedCancellationPolicyVersion: 3,
      },
      'booking-idempotency-0001',
    );

    expect(createFromAcceptance).toHaveBeenCalledWith(
      patientAccess.userId,
      acceptanceId,
      { depositBasisPoints: 2000, cancellationPolicyVersion: 3 },
      expect.objectContaining({ userId: patientAccess.userId }),
      patientAccess.requestId,
      expect.objectContaining({ operation: 'booking.checkout' }),
    );
    expect(createDepositIntent).toHaveBeenCalledWith(
      patientAccess,
      record.id,
      'booking-idempotency-0001',
    );
  });

  it('isolates clinic reads to the selected organization', async () => {
    const service = new BookingsService({} as PrismaClient, {} as PaymentsService);
    const listScoped = vi.fn().mockResolvedValue([]);
    Object.defineProperty(service, 'bookings', { value: { listScoped } });
    await service.list(
      {
        ...patientAccess,
        roles: ['CLINIC_ADMIN'],
        selectedOrganizationId: '00000000-0000-4000-8000-000000000030',
        mfaVerified: true,
      },
      { limit: 25 },
    );
    expect(listScoped).toHaveBeenCalledWith(
      { kind: 'CLINIC', organizationId: '00000000-0000-4000-8000-000000000030' },
      { limit: 25 },
    );
  });

  it('requires current MFA for finance-wide history', async () => {
    const service = new BookingsService({} as PrismaClient, {} as PaymentsService);
    await expect(
      service.list({ ...patientAccess, roles: ['FINANCE_ADMIN'] }, { limit: 25 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function bookingRecord(): BookingRecord {
  const now = new Date('2026-07-12T00:00:00.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000021',
    caseId: '00000000-0000-4000-8000-000000000022',
    treatmentPlanVersionId: '00000000-0000-4000-8000-000000000023',
    treatmentPlanAcceptanceId: '00000000-0000-4000-8000-000000000024',
    status: 'PENDING_DEPOSIT',
    planTotalMinor: 250_000n,
    depositMinor: 50_000n,
    depositBasisPoints: 2000,
    currency: 'USD',
    cancellationPolicySnapshot: {
      policyVersion: 3,
      cancellationCutoffMinutes: 1440,
      termsVersion: '2026-07-12',
      source: 'CLINIC_POLICY',
      display: { 'vi-VN': 'Điều khoản hủy.', 'en-US': 'Cancellation terms.' },
    },
    version: 1,
    confirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
    dentalCase: {
      caseNumber: 'DT-TEST-0001',
      patientProfile: { userId: patientAccess.userId },
    },
    treatmentPlanAcceptance: { acceptedAt: now, userId: patientAccess.userId },
    treatmentPlanVersion: {
      version: 3,
      treatmentPlan: {
        clinic: {
          id: '00000000-0000-4000-8000-000000000025',
          name: 'Test Clinic',
          organizationId: '00000000-0000-4000-8000-000000000026',
        },
      },
    },
    invoice: {
      id: '00000000-0000-4000-8000-000000000027',
      bookingId: '00000000-0000-4000-8000-000000000021',
      paymentId: null,
      invoiceNumber: 'DTI-TEST-0001',
      status: 'ISSUED',
      amountMinor: 50_000n,
      currency: 'USD',
      version: 1,
      issuedAt: now,
      paidAt: null,
      voidedAt: null,
      updatedAt: now,
    },
    payment: null,
  };
}
