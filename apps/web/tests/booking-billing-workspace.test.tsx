import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from '@dental-trust/i18n';

import { BookingBillingWorkspace } from '@/components/booking-billing-workspace';

const option = {
  treatmentPlanAcceptanceId: '028f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  treatmentPlanVersionId: '038f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  treatmentPlanVersion: 3,
  caseId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  caseNumber: 'DT-2026-A1B2C3D4E5',
  clinicId: '048f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  clinicName: 'Minh An Dental Center',
  planTotalMinor: '128000000',
  depositMinor: '25600000',
  depositBasisPoints: 2000,
  currency: 'VND',
  cancellationPolicy: {
    policyVersion: 4,
    cancellationCutoffMinutes: 1440,
    termsVersion: '2026-07-12',
    source: 'CLINIC_POLICY',
    display: {
      'vi-VN': 'Yêu cầu hủy hoặc đổi lịch trước ít nhất 24 giờ.',
      'en-US': 'Request cancellation or rescheduling at least 24 hours in advance.',
    },
  },
  acceptedAt: '2026-07-12T07:00:00.000Z',
  expiresAt: '2026-12-31T23:59:59.000Z',
} as const;

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('BookingBillingWorkspace', () => {
  it('shows the server deposit and bilingual policy before forwarding preview evidence', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [option] }))
      .mockResolvedValueOnce(
        Response.json({
          data: { depositIntent: { status: 'REQUIRES_ACTION', clientSecret: null } },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BookingBillingWorkspace
        area="patient"
        pageKey="checkout"
        title="Confirm booking"
        description="Review before payment"
        locale="en"
        messages={getMessages('en')}
        development
      />,
    );

    expect(await screen.findByText('Minh An Dental Center')).toBeInTheDocument();
    expect(screen.getByText(/25,600,000/u)).toBeInTheDocument();
    expect(screen.getByText(option.cancellationPolicy.display['en-US'])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and pay' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      payload: Record<string, unknown>;
    };
    expect(request.payload).toMatchObject({
      treatmentPlanAcceptanceId: option.treatmentPlanAcceptanceId,
      expectedDepositBasisPoints: 2000,
      expectedCancellationPolicyVersion: 4,
    });
    expect(await screen.findByText('The test transaction was initialized.')).toBeInTheDocument();
  });

  it('renders Vietnamese document history from ledger-backed booking data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: [
            {
              id: '058f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
              caseId: option.caseId,
              caseNumber: option.caseNumber,
              treatmentPlanVersionId: option.treatmentPlanVersionId,
              treatmentPlanAcceptanceId: option.treatmentPlanAcceptanceId,
              treatmentPlanVersion: 3,
              clinicId: option.clinicId,
              clinicName: option.clinicName,
              status: 'CONFIRMED',
              planTotalMinor: option.planTotalMinor,
              depositMinor: option.depositMinor,
              depositBasisPoints: 2000,
              currency: 'VND',
              cancellationPolicy: option.cancellationPolicy,
              version: 2,
              confirmedAt: '2026-07-12T08:05:00.000Z',
              cancelledAt: null,
              completedAt: null,
              cancellationReason: null,
              createdAt: '2026-07-12T08:00:00.000Z',
              updatedAt: '2026-07-12T08:05:00.000Z',
              invoice: {
                id: '068f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
                bookingId: '058f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
                paymentId: '078f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
                invoiceNumber: 'DTI-20260712-DEV0001',
                status: 'PAID',
                amountMinor: option.depositMinor,
                refundedMinor: '0',
                currency: 'VND',
                version: 2,
                issuedAt: '2026-07-12T08:00:00.000Z',
                paidAt: '2026-07-12T08:05:00.000Z',
                voidedAt: null,
                updatedAt: '2026-07-12T08:05:00.000Z',
              },
              receipt: {
                id: '088f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
                paymentId: '078f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
                receiptNumber: 'DTR-20260712-DEV0001',
                status: 'ISSUED',
                amountMinor: option.depositMinor,
                refundedMinor: '0',
                currency: 'VND',
                version: 1,
                issuedAt: '2026-07-12T08:05:00.000Z',
                updatedAt: '2026-07-12T08:05:00.000Z',
              },
              payment: null,
            },
          ],
        }),
      ),
    );
    render(
      <BookingBillingWorkspace
        area="patient"
        pageKey="payments"
        title="Thanh toán"
        description="Lịch sử"
        locale="vi"
        messages={getMessages('vi')}
        development
      />,
    );
    expect(await screen.findByText('DTI-20260712-DEV0001 · Đã thanh toán')).toBeInTheDocument();
    expect(screen.getByText('DTR-20260712-DEV0001')).toBeInTheDocument();
    expect(screen.getByText(option.cancellationPolicy.display['vi-VN'])).toBeInTheDocument();
  });
});
