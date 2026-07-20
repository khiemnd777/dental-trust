import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import type { ServerEnvironment } from '@dental-trust/config/server';
import type { ClinicOperationsRepository, PrismaClient } from '@dental-trust/database';
import type { DomainRuleError } from '@dental-trust/domain';

import type { CalendarSyncProvider } from '../infrastructure/providers/calendar-sync.provider.js';
import type { PayoutProvider } from '../infrastructure/providers/payout.provider.js';
import type { VerificationService } from '../verification/verification.service.js';
import { ClinicOperationsService } from './clinic-operations.service.js';

const organizationId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';

describe('ClinicOperationsService security and provider orchestration', () => {
  it('passes the selected organization into the repository tenant lookup', async () => {
    const service = createService();
    const loadOperator = vi.fn().mockResolvedValue(operator());
    const overview = vi.fn().mockResolvedValue({
      onboarding: null,
      newCases: 0,
      activeAppointments: 0,
      activeTeam: 0,
      openIncidents: 0,
      activeServices: 0,
    });
    replaceOperations(service, { loadOperator, overview });
    await service.overview(access());
    expect(loadOperator).toHaveBeenCalledWith(access().userId, organizationId);
    expect(overview).toHaveBeenCalledWith(clinicId, organizationId);
  });

  it('returns the refreshed opportunity after assignment without requiring CASE_INBOX', async () => {
    const service = createService();
    const restrictedOperator = {
      ...operator(),
      permissions: ['CASE_ASSIGN_DENTIST'] as const,
    };
    const assignDentist = vi.fn().mockResolvedValue(undefined);
    const opportunities = vi.fn().mockResolvedValue({ records: [], nextCursor: null });
    replaceOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(restrictedOperator),
      assignDentist,
      opportunities,
    });

    await expect(
      service.assignDentist(
        access(),
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e09',
        { dentistId },
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e10',
      ),
    ).resolves.toEqual({ records: [], nextCursor: null });
    expect(assignDentist).toHaveBeenCalledOnce();
    expect(opportunities).toHaveBeenCalledWith(clinicId, organizationId, { limit: 25 });
  });

  it('encrypts business contact fields before repository persistence', async () => {
    const service = createService();
    let encryptedBusinessContact = '';
    replaceOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(operator()),
      updateProfile: vi.fn((_clinicId: string, input: { encryptedBusinessContact: string }) => {
        encryptedBusinessContact = input.encryptedBusinessContact;
        throw new Error('stop-after-capture');
      }),
    });
    await expect(
      service.updateProfile(
        access(),
        {
          expectedVersion: 1,
          legalEntityName: 'Clinic Legal Entity',
          registrationNumber: 'REG-1',
          registrationCountry: 'VN',
          businessContact: {
            email: 'private-contact@example.com',
            phone: '+842812345678',
            contactName: 'Private Contact',
          },
          responsibleClinicalLeaderDentistId: dentistId,
          aftercarePolicy: {
            responseTargetHours: 24,
            emergencyProtocol: 'Escalate to a licensed provider and emergency services.',
            remoteFollowUpAvailable: true,
          },
        },
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
      ),
    ).rejects.toThrow('stop-after-capture');
    expect(encryptedBusinessContact).not.toContain('private-contact@example.com');
    expect(encryptedBusinessContact.length).toBeGreaterThan(40);
  });

  it('records a bounded calendar error and fails closed when the provider is unavailable', async () => {
    const calendar = developmentCalendar();
    vi.mocked(calendar.connect).mockRejectedValue(new Error('credential detail must not escape'));
    const service = createService(calendar);
    const recordCalendarConnectionStatus = vi.fn().mockResolvedValue(undefined);
    replaceOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(operator()),
      reserveCalendarConnection: vi.fn().mockResolvedValue({ id: 'connection-a' }),
      recordCalendarConnectionStatus,
    });
    await expect(
      service.connectCalendar(
        access(),
        { provider: 'google', externalCalendarReference: 'calendar@example.com' },
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(recordCalendarConnectionStatus).toHaveBeenCalledWith(
      clinicId,
      'connection-a',
      { status: 'ERROR', lastSyncedAt: null, lastErrorCode: 'PROVIDER_UNAVAILABLE' },
      expect.anything(),
      expect.anything(),
    );
  });

  it('rejects incomplete onboarding before creating or submitting verification evidence', async () => {
    const verification = {
      ensureClinicCase: vi.fn(),
      addEvidence: vi.fn(),
      submitClinicCase: vi.fn(),
    } as unknown as VerificationService;
    const service = createService(developmentCalendar(), verification);
    replaceOperations(service, {
      loadOperator: vi.fn().mockResolvedValue(operator()),
      onboarding: vi.fn().mockResolvedValue(incompleteOnboarding()),
    });
    await expect(
      service.submitOnboarding(
        access(),
        {
          expectedVersion: 1,
          attestation: 'I attest that the submitted clinic information is complete and accurate.',
        },
        '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
      ),
    ).rejects.toMatchObject({
      code: 'CLINIC_ONBOARDING_INCOMPLETE',
    } satisfies Partial<DomainRuleError>);
    expect(verification.ensureClinicCase).not.toHaveBeenCalled();
  });
});

function createService(
  calendar: CalendarSyncProvider = developmentCalendar(),
  verification: VerificationService = {} as VerificationService,
): ClinicOperationsService {
  return new ClinicOperationsService(
    {} as PrismaClient,
    {
      FIELD_ENCRYPTION_KEY: 'unit-test-field-encryption-key-with-ample-entropy',
      APP_URL: 'http://localhost:3000',
    } as ServerEnvironment,
    {} as PayoutProvider,
    calendar,
    verification,
  );
}

function replaceOperations(
  service: ClinicOperationsService,
  operations: Partial<Record<keyof ClinicOperationsRepository, unknown>>,
): void {
  Object.defineProperty(service, 'operations', { value: operations });
}

function developmentCalendar(): CalendarSyncProvider {
  return {
    connect: vi.fn().mockResolvedValue({ status: 'ACTIVE', syncedAt: new Date(), errorCode: null }),
    sync: vi.fn().mockResolvedValue({ status: 'ACTIVE', syncedAt: new Date(), errorCode: null }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function operator() {
  return {
    clinicId,
    organizationId,
    role: 'CLINIC_ADMIN' as const,
    permissions: [
      'CASE_INBOX',
      'CASE_ASSIGN_DENTIST',
      'TREATMENT_PLAN',
      'SCHEDULING',
      'CLINICAL_RECORDS',
      'AFTERCARE',
      'INCIDENT_RESPONSE',
      'REVIEW_RESPONSE',
      'ANALYTICS_READ',
    ] as const,
    locationIds: [],
  };
}

function access(): AccessContext {
  return {
    userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e07',
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e08',
    roles: [],
    memberships: [{ organizationId, role: 'CLINIC_ADMIN' }],
    selectedOrganizationId: organizationId,
    mfaVerified: true,
    requestId: 'clinic-service-test',
  };
}

function incompleteOnboarding() {
  return {
    clinic: {
      id: clinicId,
      organizationId,
      name: 'Incomplete Clinic',
      slug: 'incomplete-clinic',
      legalEntityName: '',
      verificationStatus: 'NOT_SUBMITTED',
    },
    profile: {
      version: 1,
      registrationNumber: null,
      registrationCountry: null,
      encryptedBusinessContact: null,
      responsibleClinicalLeaderDentistId: null,
      aftercarePolicy: null,
      payoutStatus: 'NOT_STARTED',
      termsVersion: null,
      termsAcceptedAt: null,
      verificationCaseId: null,
      submittedAt: null,
    },
    locations: [],
    declarations: [],
    documents: [],
    dentistCount: 0,
    staffCount: 0,
    serviceCount: 0,
    warrantyCount: 0,
  };
}
