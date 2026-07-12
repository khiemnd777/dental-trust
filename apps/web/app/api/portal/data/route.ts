import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authorizePortalRoute, getSession, sessionApiHeaders } from '@/lib/session';
import {
  developmentCaseId,
  developmentCaseNumber,
  developmentSiteAuditId,
  developmentVerificationClinicCaseId,
  developmentVerificationDentistCaseId,
  type PortalArea,
} from '@/lib/routing';

const areas = new Set<PortalArea>(['patient', 'clinic', 'concierge', 'verification', 'admin']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resourcePages = new Set([
  'patient:case',
  'patient:intake',
  'patient:records',
  'patient:shortlist',
  'patient:plans',
  'patient:consultations',
  'patient:messages',
  'patient:aftercare',
  'patient:caregivers',
  'patient:journey',
  'patient:passport',
  'clinic:planBuilder',
  'clinic:progress',
  'clinic:passport',
  'clinic:scheduling',
  'clinic:messages',
  'concierge:cases',
  'concierge:matching',
  'concierge:scheduling',
  'concierge:aftercare',
  'concierge:incidents',
  'concierge:tasks',
]);

function patientOnboardingDevelopmentData() {
  return {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed2',
    email: 'patient@dentaltrust.local',
    preferredLocale: 'en-US',
    preferredCurrency: 'USD',
    currentCountry: 'Australia',
    currentCity: 'Melbourne',
    timezone: 'Australia/Melbourne',
    identity: {
      fullName: 'Linh Nguyen',
      dateOfBirth: '1988-04-18',
      pronouns: 'she/her',
    },
    contact: { phoneE164: '+61412345678' },
    preferences: {
      contactChannel: 'MESSAGE',
      travelCoordination: true,
      appointmentReminders: true,
    },
    emergencyContact: {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed8',
      name: 'Minh Nguyen',
      phoneE164: '+61487654321',
      relationship: 'Partner',
      version: 1,
    },
    onboardingCompletedAt: '2026-07-10T08:00:00.000Z',
    version: 2,
  };
}

function patientIntakeDevelopmentData() {
  const current = {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed9',
    version: 1,
    status: 'DRAFT',
    desiredProcedureCode: 'DENTAL_IMPLANT',
    dentalConcerns: ['MISSING_TOOTH', 'CHEWING_COMFORT'],
    existingDiagnosis: 'No formal diagnosis; seeking a licensed dentist assessment.',
    treatmentGoals: ['RESTORE_FUNCTION', 'NATURAL_APPEARANCE'],
    cosmeticExpectations: 'A natural-looking restoration that matches nearby teeth.',
    currentCountry: 'Australia',
    currentCity: 'Melbourne',
    expectedArrivalDate: '2026-10-10',
    expectedDepartureDate: '2026-10-20',
    preferredLocation: 'Ho Chi Minh City',
    availableTreatmentDays: 8,
    budget: { minimumMinor: 25000000, maximumMinor: 70000000, currency: 'VND' },
    preferredLanguage: 'en',
    priorDentalWork: 'Crown placed on tooth 26 in 2021; no implant history.',
    existingImplantSystems: [],
    medicalConditions: [{ code: 'HYPERTENSION', details: 'Controlled with medication.' }],
    medications: [{ name: 'Amlodipine', dosage: '5 mg daily' }],
    allergies: [{ substance: 'Penicillin', reaction: 'Rash' }],
    smokingStatus: 'NEVER',
    pregnancyStatus: 'NOT_PREGNANT',
    accessibilityNeeds: [],
    preferredConsultationTimes: [
      { weekday: 2, start: '18:00', end: '20:00', timezone: 'Australia/Melbourne' },
    ],
    consentPurposes: [],
    currentStep: 5,
    draftRevision: 4,
    submittedAt: null,
    contentChecksum: null,
    createdAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-12T08:00:00.000Z',
  };
  return {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9eda',
    caseId: developmentCaseId,
    current,
    history: [current],
    progress: { completedSteps: 5, totalSteps: 6, percent: 83, nextStep: 6 },
  };
}

function developmentData(
  area: PortalArea,
  pageKey: string,
  threadId?: string,
  view?: string,
  resourceId?: string,
) {
  if (area === 'verification') return verificationDevelopmentData(pageKey, resourceId);
  const shared = {
    caseId: developmentCaseId,
    caseNumber: developmentCaseNumber,
    status: 'COORDINATING',
    progress: 64,
  };
  if (area === 'patient' && pageKey === 'onboarding') return patientOnboardingDevelopmentData();
  if (area === 'patient' && pageKey === 'intake') return patientIntakeDevelopmentData();
  if (area === 'patient' && pageKey === 'shortlist') return matchingDevelopmentShortlist();
  if (area === 'concierge') return conciergeDevelopmentData(pageKey);
  if (area === 'patient' && pageKey === 'checkout') return bookingCheckoutDevelopmentOptions();
  if (
    (area === 'patient' && pageKey === 'payments') ||
    (area === 'clinic' && pageKey === 'billing')
  )
    return [bookingDevelopmentRecord()];
  if (area === 'clinic' && clinicOperationsPages.has(pageKey))
    return clinicOperationsDevelopmentData(pageKey);
  if (pageKey === 'records')
    return {
      ...shared,
      files: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e11',
          caseId: developmentCaseId,
          fileAssetId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e41',
          category: 'RADIOGRAPH',
          description: null,
          originalFileName: 'panoramic-xray-2026.pdf',
          declaredMediaType: 'application/pdf',
          detectedMediaType: 'application/pdf',
          sizeBytes: 2840000,
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          createdAt: '2026-07-05T08:00:00.000Z',
        },
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e12',
          caseId: developmentCaseId,
          fileAssetId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e42',
          category: 'MEDICAL_HISTORY',
          description: null,
          originalFileName: 'medical-history.pdf',
          declaredMediaType: 'application/pdf',
          detectedMediaType: 'application/pdf',
          sizeBytes: 420000,
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          createdAt: '2026-07-05T08:05:00.000Z',
        },
      ],
    };
  if (pageKey === 'plans')
    return {
      ...shared,
      plans: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e21',
          treatmentPlanId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e25',
          caseId: developmentCaseId,
          clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
          clinicLocationId: null,
          clinicName: 'Minh An Dental Center',
          authoringDentistId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
          authoringDentistName: 'Dr. Minh Nguyen',
          version: 3,
          status: 'PUBLISHED',
          preliminaryAssessment: 'Development-only preliminary assessment.',
          diagnosisStatement: 'Development-only provider diagnosis.',
          risks: 'Development-only risks.',
          limitations: 'Development-only limitations.',
          warrantyTerms: 'Development-only 60-month clinic warranty terms.',
          exclusions: 'Development-only exclusions.',
          currency: 'VND',
          totalMinor: 128000000,
          expiresAt: '2026-12-31T23:59:59.000Z',
          publishedAt: '2026-07-01T00:00:00.000Z',
          contentChecksum: 'a'.repeat(64),
          acceptedAt: null,
          acceptanceConsentTextVersionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e28',
          items: [
            {
              id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e29',
              procedureCode: 'DENTAL_IMPLANT',
              toothNumbers: [11],
              quantity: 1,
              material: 'Titanium',
              brand: null,
              unitPriceMinor: 128000000,
              totalPriceMinor: 128000000,
              sortOrder: 0,
            },
          ],
          createdAt: '2026-06-30T00:00:00.000Z',
        },
      ],
    };
  if (pageKey === 'aftercare')
    return {
      ...shared,
      aftercarePlans: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e51',
          caseId: developmentCaseId,
          active: true,
          startsAt: '2026-07-01T00:00:00.000Z',
          completedAt: null,
          checkIns: [],
        },
      ],
    };
  if (pageKey === 'caregivers')
    return {
      ...shared,
      caregivers: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e31',
          caseId: developmentCaseId,
          caregiverUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e32',
          caregiverEmail: 'family@example.com',
          permissions: ['VIEW_CASE_SUMMARY', 'VIEW_TREATMENT_PLANS'],
          grantedAt: '2026-07-01T00:00:00.000Z',
          expiresAt: null,
          revokedAt: null,
          lastAccessedAt: null,
        },
      ],
    };
  if (pageKey === 'journey' || pageKey === 'progress')
    return {
      ...shared,
      milestones: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ea1',
          code: 'ARRIVAL_CONSULTATION',
          title: 'Arrival consultation / Khám khi đến',
          status: 'COMPLETED',
          scheduledAt: '2026-07-10T02:00:00.000Z',
          completedAt: '2026-07-10T03:00:00.000Z',
          completedByUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
          version: 2,
        },
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ea2',
          code: 'FINAL_REVIEW',
          title: 'Final review / Kiểm tra cuối',
          status: 'IN_PROGRESS',
          scheduledAt: '2026-07-13T02:00:00.000Z',
          completedAt: null,
          completedByUserId: null,
          version: 1,
        },
      ],
      instructions: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ea3',
          milestoneId: null,
          authorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
          type: 'DISCHARGE',
          locale: 'vi-VN',
          content: 'Hướng dẫn xuất viện do nha sĩ điều trị cung cấp.',
          createdAt: '2026-07-12T02:00:00.000Z',
        },
      ],
      planChanges: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ea4',
          fromPlanVersionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e21',
          authorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
          kind: 'PRICE',
          reason: 'Provider-recorded material price adjustment.',
          changes: [
            {
              field: 'TOTAL_PRICE_MINOR',
              beforeValue: '128000000',
              afterValue: '130000000',
            },
          ],
          createdAt: '2026-07-12T02:30:00.000Z',
          acknowledgedAt: null,
        },
      ],
    };
  if (pageKey === 'passport')
    return {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9eb1',
      caseId: developmentCaseId,
      caseNumber: developmentCaseNumber,
      version: 1,
      schemaVersion: 1,
      status: area === 'clinic' ? 'DRAFT' : 'PUBLISHED',
      clinic: {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
        name: 'Minh An Dental Center',
      },
      treatingDentist: {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
        fullName: 'Dr. Minh Nguyen',
      },
      treatmentCompletedAt: '2026-07-12',
      treatmentSummary: 'Provider-authored development treatment summary.',
      dischargeInstructions: 'Provider-authored development discharge instructions.',
      followUpInstructions: 'Provider-authored development follow-up instructions.',
      implants: [],
      materials: [{ procedureCode: 'DENTAL_IMPLANT', material: 'Titanium' }],
      prescriptions: [],
      integrity: {
        algorithm: 'SHA-256',
        contentChecksum: 'a'.repeat(64),
        previousVersionChecksum: null,
        verified: true,
      },
      publishedAt: area === 'clinic' ? null : '2026-07-12T08:00:00.000Z',
      createdAt: '2026-07-12T08:00:00.000Z',
      downloadable: area !== 'clinic',
    };
  if (pageKey === 'planBuilder')
    return {
      ...shared,
      plans: [],
      authoringContext: {
        clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
        clinicName: 'Minh An Dental Center',
        dentistOptions: [
          {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
            fullName: 'Dr. Minh Nguyen',
            isCurrentUser: true,
          },
        ],
      },
    };
  if (pageKey === 'consultations' || pageKey === 'scheduling')
    return {
      ...shared,
      appointments: [
        {
          id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e61',
          caseId: developmentCaseId,
          clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
          dentistId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
          kind: 'CONSULTATION',
          startsAt: '2026-10-12T02:00:00.000Z',
          endsAt: '2026-10-12T03:00:00.000Z',
          timezone: 'Asia/Ho_Chi_Minh',
          status: 'CONFIRMED',
          version: 1,
          meetingProvider: 'development',
          meetingJoinUrl: 'http://localhost:3000/dev-meetings/example',
          cancellationReason: null,
          cancelledAt: null,
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
      ],
      schedulingContext: {
        clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
        clinicName: 'Minh An Dental Center',
        dentists: [
          {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
            fullName: 'Dr. Minh Nguyen',
          },
        ],
        locations: [
          {
            id: 'c18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
            name: 'District 1 Clinic',
            timezone: 'Asia/Ho_Chi_Minh',
          },
        ],
      },
    };
  if (pageKey === 'messages') {
    const fixtureThreadId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e71';
    if (threadId && view === 'internal-notes')
      return {
        internalNotes: [
          {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e74',
            threadId: fixtureThreadId,
            authorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e27',
            internalNote: 'Development-only internal clinical note.',
            createdAt: '2026-07-12T01:30:00.000Z',
          },
        ],
      };
    if (threadId)
      return {
        messages: [
          {
            id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e72',
            threadId: fixtureThreadId,
            authorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e73',
            messageBody: 'Development-only question about the consultation.',
            readByCurrentUser: false,
            attachments: [],
            createdAt: '2026-07-12T01:00:00.000Z',
            editedAt: null,
          },
        ],
      };
    return {
      ...shared,
      threads: [
        {
          id: fixtureThreadId,
          caseId: developmentCaseId,
          threadSubject: 'Consultation questions',
          closedAt: null,
          messageCount: 1,
          unreadCount: 1,
          lastMessageAt: '2026-07-12T01:00:00.000Z',
          createdAt: '2026-07-12T01:00:00.000Z',
          updatedAt: '2026-07-12T01:00:00.000Z',
        },
      ],
    };
  }
  return shared;
}

const clinicOperationsPages = new Set([
  'dashboard',
  'onboarding',
  'verification',
  'profile',
  'dentists',
  'team',
  'cases',
  'availability',
  'pricing',
  'analytics',
  'billing',
  'settings',
]);

function clinicOperationsDevelopmentData(pageKey: string): unknown {
  const clinicId = 'c18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
  const organizationId = 'b18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
  const locationId = 'c28f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
  const dentistId = 'd18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
  const onboarding = {
    clinicId,
    organizationId,
    clinicName: 'Minh An Dental Center',
    slug: 'minh-an-dental-center',
    verificationStatus: 'DRAFT',
    version: 7,
    progressPercent: 81,
    missingRequirements: ['PAYOUT', 'DECLARATION:ENGLISH_RECORDS_CAPABILITY'],
    legalEntityName: 'Minh An Dental Company Limited',
    registrationNumber: '0312345678',
    registrationCountry: 'VN',
    businessContact: {
      email: 'operations@minhan.example',
      phone: '+842812345678',
      website: 'https://minhan.example',
      contactName: 'Nguyen Minh An',
    },
    responsibleClinicalLeaderDentistId: dentistId,
    aftercarePolicy: {
      responseTargetHours: 24,
      emergencyProtocol: 'Escalate to the responsible licensed dentist and local emergency care.',
      remoteFollowUpAvailable: true,
    },
    payoutStatus: 'INCOMPLETE',
    termsVersion: '2026-07-12',
    termsAcceptedAt: '2026-07-10T08:00:00.000Z',
    verificationCaseId: null,
    submittedAt: null,
    locations: [
      {
        id: locationId,
        name: 'District 1 Clinic',
        address: '12 Nguyen Hue',
        city: 'Ho Chi Minh City',
        district: 'District 1',
        timezone: 'Asia/Ho_Chi_Minh',
        active: true,
        businessContact: {
          email: 'district1@minhan.example',
          phone: '+842812345679',
          contactName: 'Front desk',
        },
      },
    ],
    declarations: [
      {
        id: 'c38f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        kind: 'EQUIPMENT',
        code: 'CBCT_ON_SITE',
        name: 'On-site CBCT',
        details: { description: 'Provider-declared equipment; verification pending.' },
        active: true,
      },
    ],
    documents: [
      {
        id: 'c48f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        kind: 'OPERATING_LICENSE',
        fileAssetId: 'c58f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        label: 'Operating license 2026',
        status: 'AVAILABLE',
        scanStatus: 'CLEAN',
        createdAt: '2026-07-10T08:00:00.000Z',
      },
    ],
  };
  const dentists = [
    {
      id: dentistId,
      fullName: 'Dr. Minh Nguyen',
      slug: 'dr-minh-nguyen',
      licenseNumber: 'HCM-123456',
      licenseStatus: 'VERIFIED',
      active: true,
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: null,
    },
  ];
  if (['onboarding', 'verification', 'profile', 'settings'].includes(pageKey)) return onboarding;
  if (pageKey === 'dashboard')
    return {
      clinicId,
      newCases: 7,
      activeAppointments: 12,
      activeTeam: 8,
      openIncidents: 1,
      activeServices: 6,
      onboarding,
    };
  if (pageKey === 'dentists') return dentists;
  if (pageKey === 'team')
    return {
      members: [
        {
          membershipId: 'e18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          userId: 'e28f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          email: 'clinic.admin@minhan.example',
          role: 'CLINIC_ADMIN',
          status: 'ACTIVE',
          jobTitle: 'Clinic administrator',
          locationIds: [locationId],
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
          ],
          mfaEnabled: true,
          version: 3,
          acceptedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      invitations: [
        {
          id: 'e38f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          email: 'scheduler@minhan.example',
          role: 'CLINIC_STAFF',
          permissions: ['CASE_INBOX', 'SCHEDULING'],
          jobTitle: 'Scheduler',
          expiresAt: '2026-07-19T08:00:00.000Z',
          createdAt: '2026-07-12T08:00:00.000Z',
        },
      ],
      activity: [
        {
          id: 'e48f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          actorUserId: 'e28f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          action: 'clinic.team-invited',
          resourceType: 'ClinicTeamInvitation',
          resourceId: 'e38f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          success: true,
          createdAt: '2026-07-12T08:00:00.000Z',
        },
      ],
    };
  if (pageKey === 'cases')
    return [
      {
        caseId: developmentCaseId,
        caseNumber: developmentCaseNumber,
        status: 'ASSIGNED',
        caseStatus: 'COORDINATING',
        desiredProcedureCode: 'DENTAL_IMPLANT',
        preferredLocation: 'Ho Chi Minh City',
        expectedArrivalDate: '2026-10-10',
        expectedDepartureDate: '2026-10-20',
        preferredCurrency: 'USD',
        assignedAt: '2026-07-12T08:00:00.000Z',
        respondedAt: null,
        assignedDentistId: dentistId,
        version: 0,
      },
    ];
  if (pageKey === 'availability')
    return {
      rules: [
        {
          id: 'f18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          locationId,
          dentistId,
          slotKind: 'BOTH',
          dayOfWeek: 1,
          startsAtLocal: '08:00',
          endsAtLocal: '17:00',
          timezone: 'Asia/Ho_Chi_Minh',
          capacity: 2,
          procedureDurationMinutes: 60,
          effectiveFrom: '2026-07-01',
          effectiveUntil: null,
          active: true,
          version: 1,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      blocks: [],
      policy: {
        id: 'f28f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        clinicId,
        minimumNoticeMinutes: 1440,
        maximumAdvanceDays: 180,
        rescheduleCutoffMinutes: 1440,
        cancellationCutoffMinutes: 1440,
        defaultConsultationMinutes: 60,
        defaultTreatmentMinutes: 120,
        overbookingAllowed: false,
        version: 1,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      calendarConnections: [
        {
          id: 'f38f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          dentistId,
          provider: 'google',
          status: 'ACTIVE',
          lastSyncedAt: '2026-07-12T08:00:00.000Z',
          lastErrorCode: null,
        },
      ],
    };
  if (pageKey === 'pricing')
    return {
      services: [
        {
          id: 'f48f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          procedureDefinitionId: 'f58f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          procedureCode: 'DENTAL_IMPLANT',
          displayNames: { 'vi-VN': 'Cấy ghép implant', 'en-US': 'Dental implant' },
          active: true,
          versions: [
            {
              id: 'f68f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
              minimumMinor: 25000000,
              maximumMinor: 45000000,
              currency: 'VND',
              materialOptions: ['Titanium'],
              brandOptions: ['Straumann'],
              serviceSnapshot: { warrantyName: 'Implant warranty' },
              effectiveAt: '2026-07-01T00:00:00.000Z',
              expiresAt: null,
            },
          ],
        },
      ],
      catalog: [
        {
          id: 'f58f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
          code: 'DENTAL_IMPLANT',
          names: { 'vi-VN': 'Cấy ghép implant', 'en-US': 'Dental implant' },
        },
      ],
    };
  if (pageKey === 'analytics')
    return {
      generatedAt: '2026-07-12T08:00:00.000Z',
      periodDays: 90,
      metrics: {
        newCases: 18,
        averageResponseHours: 4.2,
        averagePlanCompletionHours: 31.5,
        consultationConversionRate: 0.72,
        bookingConversionRate: 0.48,
        treatmentCompletionRate: 0.91,
        averageCostVarianceRate: 0.03,
        averageScheduleVarianceHours: 1.8,
        incidentRate: 0.02,
        warrantyRate: 0.01,
        verifiedReviewCount: 42,
        averageVerifiedRating: 4.8,
        aftercareResponseSlaRate: 0.94,
        nextVerificationExpiry: '2027-06-01',
      },
      paymentSummaries: [{ currency: 'VND', count: 14, grossAmountMinor: 620000000 }],
      unavailableMetrics: [],
    };
  if (pageKey === 'billing')
    return {
      payout: {
        provider: 'development',
        status: 'ACTIVE',
        updatedAt: '2026-07-12T08:00:00.000Z',
      },
      payments: [{ currency: 'VND', status: 'SUCCEEDED', count: 14, amountMinor: 620000000 }],
    };
  return null;
}

function verificationDevelopmentData(pageKey: string, resourceId?: string) {
  const clinicSummary = {
    id: developmentVerificationClinicCaseId,
    subjectType: 'CLINIC',
    subjectId: '418f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    subjectName: 'Saigon Smiles Dental Center',
    status:
      pageKey === 'expiring'
        ? 'VERIFICATION_EXPIRING'
        : pageKey === 'suspension'
          ? 'SUSPENDED'
          : pageKey === 'corrective'
            ? 'ADDITIONAL_INFORMATION_REQUIRED'
            : 'UNDER_REVIEW',
    riskLevel: 'HIGH',
    assignedReviewerUserId: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    version: 8,
    submittedAt: '2026-07-01T02:00:00.000Z',
    decidedAt: null,
    expiresAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-07-12T06:00:00.000Z',
  };
  const dentistSummary = {
    ...clinicSummary,
    id: developmentVerificationDentistCaseId,
    subjectType: 'DENTIST',
    subjectId: '618f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    subjectName: 'Dr. Minh Nguyen',
    status: 'SUBMITTED',
    riskLevel: 'STANDARD',
    version: 3,
  };
  if (!resourceId && pageKey === 'clinic') return [clinicSummary];
  if (!resourceId && pageKey === 'dentist') return [dentistSummary];
  if (!resourceId && pageKey === 'audit')
    return [{ ...clinicSummary, status: 'SITE_AUDIT_REQUIRED' }];
  if (['dashboard', 'corrective', 'expiring', 'suspension'].includes(pageKey)) {
    return pageKey === 'dashboard' ? [clinicSummary, dentistSummary] : [clinicSummary];
  }
  const dentist = pageKey === 'dentist';
  const summary = dentist ? dentistSummary : clinicSummary;
  return {
    ...summary,
    methodologyVersion: '2026-01',
    requirements: [
      {
        id: '718f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        code: dentist ? 'dentist.practice-license.v1' : 'clinic.operating-license.v1',
        category: dentist ? 'DENTIST_PRACTICE_LICENSE' : 'CLINIC_OPERATING_LICENSE',
        required: true,
        highRisk: true,
        status: 'APPROVED',
        evidence: [
          {
            id: '818f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
            requirementId: '718f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
            category: dentist ? 'DENTIST_PRACTICE_LICENSE' : 'CLINIC_OPERATING_LICENSE',
            fileAssetId: null,
            sourceReference: 'Ho Chi Minh City Department of Health registry',
            contentHash: null,
            issuedAt: '2025-06-01',
            expiresAt: '2027-06-01',
            approvedAt: '2026-07-10T02:00:00.000Z',
            revokedAt: null,
            createdAt: '2026-07-01T02:00:00.000Z',
          },
        ],
      },
      {
        id: '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        code: dentist ? 'dentist.scope-of-practice.v1' : 'clinic.infection-control.v1',
        category: dentist ? 'SCOPE_OF_PRACTICE' : 'INFECTION_CONTROL_PROCESS',
        required: true,
        highRisk: true,
        status: 'PROVIDED',
        evidence: [
          {
            id: 'a18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
            requirementId: '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
            category: dentist ? 'SCOPE_OF_PRACTICE' : 'INFECTION_CONTROL_PROCESS',
            fileAssetId: null,
            sourceReference: 'Development evidence reference',
            contentHash: null,
            issuedAt: null,
            expiresAt: '2026-08-10',
            approvedAt: null,
            revokedAt: null,
            createdAt: '2026-07-11T02:00:00.000Z',
          },
        ],
      },
    ],
    reviews: [
      {
        id: 'b18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        reviewerUserId: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        secondApproverUserId: null,
        fromStatus: 'APPROVED',
        toStatus: 'VERIFIED',
        status: 'PENDING_SECOND_APPROVAL',
        fourEyesRequired: true,
        notes: 'Primary review complete; independent approval is required.',
        secondApprovalNotes: null,
        createdAt: '2026-07-12T05:00:00.000Z',
        appliedAt: null,
      },
    ],
    siteAudits: [
      {
        id: developmentSiteAuditId,
        auditorUserId: '518f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        clinicLocationId: 'c18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        status: 'SCHEDULED',
        scheduledAt: '2026-07-20T02:00:00.000Z',
        checklist: { sterilization: false, emergency_kit: false, traceability: false },
        findings: null,
        attachmentFileAssetIds: [],
        completedAt: null,
      },
    ],
    correctiveActions: [
      {
        id: 'd18f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        requirementId: '918f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
        title: 'Renew infection-control evidence',
        description: 'Provide the current signed protocol and training record.',
        response: null,
        status: 'OPEN',
        dueAt: '2026-07-31T00:00:00.000Z',
        version: 1,
        attachmentFileAssetIds: [],
        createdAt: '2026-07-12T05:30:00.000Z',
        updatedAt: '2026-07-12T05:30:00.000Z',
      },
    ],
  };
}

function bookingCheckoutDevelopmentOptions() {
  return [
    {
      treatmentPlanAcceptanceId: '028f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      treatmentPlanVersionId: '038f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      treatmentPlanVersion: 3,
      caseId: developmentCaseId,
      caseNumber: developmentCaseNumber,
      clinicId: '048f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      clinicName: 'Minh An Dental Center',
      planTotalMinor: '128000000',
      depositMinor: '25600000',
      depositBasisPoints: 2000,
      currency: 'VND',
      cancellationPolicy: {
        policyVersion: 1,
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
    },
  ];
}

function bookingDevelopmentRecord() {
  return {
    id: '058f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    caseId: developmentCaseId,
    caseNumber: developmentCaseNumber,
    treatmentPlanVersionId: '038f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    treatmentPlanAcceptanceId: '028f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    treatmentPlanVersion: 3,
    clinicId: '048f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
    clinicName: 'Minh An Dental Center',
    status: 'CONFIRMED',
    planTotalMinor: '128000000',
    depositMinor: '25600000',
    depositBasisPoints: 2000,
    currency: 'VND',
    cancellationPolicy: {
      policyVersion: 1,
      cancellationCutoffMinutes: 1440,
      termsVersion: '2026-07-12',
      source: 'CLINIC_POLICY',
      display: {
        'vi-VN': 'Yêu cầu hủy hoặc đổi lịch trước ít nhất 24 giờ.',
        'en-US': 'Request cancellation or rescheduling at least 24 hours in advance.',
      },
    },
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
      amountMinor: '25600000',
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
      amountMinor: '25600000',
      refundedMinor: '0',
      currency: 'VND',
      version: 1,
      issuedAt: '2026-07-12T08:05:00.000Z',
      updatedAt: '2026-07-12T08:05:00.000Z',
    },
    payment: {
      id: '078f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      bookingId: '058f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
      caseId: developmentCaseId,
      provider: 'development',
      providerPaymentIntentId: 'dev_seed_payment',
      amountMinor: '25600000',
      currency: 'VND',
      status: 'SUCCEEDED',
      version: 2,
      createdAt: '2026-07-12T08:00:00.000Z',
      updatedAt: '2026-07-12T08:05:00.000Z',
      refunds: [],
    },
  };
}

function matchingDevelopmentShortlist() {
  return [
    {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ec1',
      clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
      clinicName: 'Minh An Dental Center',
      clinicSlug: 'minh-an-dental-center',
      fitScore: 91,
      organicRank: 1,
      displayedRank: 1,
      overrideReason: null,
      status: 'SHARED',
      reasons: ['VERIFIED_PROCEDURE_CAPABILITY', 'PREFERRED_CITY', 'AFTERCARE_SUPPORTED'],
      limitations: ['AVAILABILITY_DATA_UNAVAILABLE'],
      evidenceIds: ['018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ec2'],
      patientInterestedAt: null,
      introductionRequest: null,
    },
    {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ec3',
      clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ec4',
      clinicName: 'Lotus International Dental',
      clinicSlug: 'lotus-international-dental',
      fitScore: 84,
      organicRank: 2,
      displayedRank: 2,
      overrideReason: null,
      status: 'INTERESTED',
      reasons: ['VERIFIED_PROCEDURE_CAPABILITY', 'PREFERRED_LANGUAGE'],
      limitations: ['ESTIMATED_PRICE_OUTSIDE_BUDGET'],
      evidenceIds: ['018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ec5'],
      patientInterestedAt: '2026-07-12T08:00:00.000Z',
      introductionRequest: null,
    },
  ];
}

function conciergeDevelopmentData(pageKey: string) {
  if (pageKey === 'dashboard')
    return {
      total: 12,
      overdue: 2,
      unassigned: 3,
      urgent: 1,
      workload: [{ userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed1', count: 7 }],
    };
  if (pageKey === 'queue')
    return [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed2',
        caseId: developmentCaseId,
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        slaDueAt: '2026-07-12T16:00:00.000Z',
        version: 3,
        assignedAgentUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed1',
        supervisorUserId: null,
        missingDocumentCategories: ['CBCT'],
        lastActivityAt: '2026-07-12T08:00:00.000Z',
        case: {
          caseNumber: developmentCaseNumber,
          title: 'Implant treatment coordination',
          status: 'COORDINATING',
          updatedAt: '2026-07-12T08:00:00.000Z',
        },
      },
    ];
  return {
    id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed2',
    caseId: developmentCaseId,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    version: 3,
    assignedAgent: {
      id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed1',
      email: 'concierge@dentaltrust.local',
    },
    supervisor: null,
    slaDueAt: '2026-07-12T16:00:00.000Z',
    lastActivityAt: '2026-07-12T08:00:00.000Z',
    patientSummary: 'Patient is planning an October visit and needs implant options.',
    missingDocumentCategories: ['CBCT'],
    patient: {
      userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed3',
      currentCountry: 'Australia',
      currentCity: 'Melbourne',
      timezone: 'Australia/Melbourne',
    },
    case: {
      id: developmentCaseId,
      caseNumber: developmentCaseNumber,
      title: 'Implant treatment coordination',
      status: 'COORDINATING',
      desiredProcedureCode: 'DENTAL_IMPLANT',
      preferredLocation: 'Ho Chi Minh City',
      expectedArrivalDate: '2026-10-10',
      expectedDepartureDate: '2026-10-20',
    },
    documents: [{ category: 'MEDICAL_HISTORY', createdAt: '2026-07-10T08:00:00.000Z' }],
    matchingCriteria: [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed4',
        version: 1,
        procedureCode: 'DENTAL_IMPLANT',
        preferredCity: 'Ho Chi Minh City',
        preferredLanguages: ['en'],
      },
    ],
    matchingResults: [
      {
        id: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ed5',
        clinicId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e26',
        clinicName: 'Minh An Dental Center',
        clinicSlug: 'minh-an-dental-center',
        organicRank: 1,
        fitScore: 91,
        reasons: ['VERIFIED_PROCEDURE_CAPABILITY', 'AFTERCARE_SUPPORTED'],
        limitations: ['AVAILABILITY_DATA_UNAVAILABLE'],
        evidenceIds: ['018f0c6a-7b2d-7d50-9a11-2f4b7c8d9ec2'],
        algorithmVersion: 'organic-v1',
        calculatedAt: '2026-07-12T08:00:00.000Z',
      },
    ],
    shortlist: matchingDevelopmentShortlist(),
    appointments: [],
    aftercarePlans: [],
    incidents: [],
    internalNotes: [],
    travelNotes: [],
    communications: [],
    tasks: [],
    handoffs: [],
    supervisorReviews: [],
  };
}

function upstreamPath(
  area: PortalArea,
  pageKey: string,
  resourceId?: string,
  threadId?: string,
  view?: string,
) {
  if (area === 'patient' && pageKey === 'onboarding') return 'patient/profile';
  if (area === 'patient' && pageKey === 'intake' && resourceId) return `cases/${resourceId}/intake`;
  if (area === 'patient' && pageKey === 'checkout') return 'bookings/checkout-options';
  if (
    (area === 'patient' && pageKey === 'payments') ||
    (area === 'clinic' && pageKey === 'billing')
  )
    return 'bookings?limit=50';
  if (area === 'clinic' && clinicOperationsPages.has(pageKey)) {
    if (pageKey === 'dashboard') return 'clinic-operations/overview';
    if (['onboarding', 'verification', 'profile', 'settings'].includes(pageKey))
      return 'clinic-operations/onboarding';
    if (pageKey === 'dentists') return 'clinic-operations/dentists';
    if (pageKey === 'team') return 'clinic-operations/team';
    if (pageKey === 'cases') return 'clinic-operations/cases?limit=25';
    if (pageKey === 'availability') return 'clinic-operations/availability';
    if (pageKey === 'pricing') return 'clinic-operations/services';
    if (pageKey === 'analytics') return 'clinic-operations/analytics';
    if (pageKey === 'billing') return 'clinic-operations/billing';
  }
  if (area === 'patient' && pageKey === 'shortlist' && resourceId)
    return `cases/${resourceId}/shortlist`;
  if (area === 'concierge') {
    if (pageKey === 'dashboard') return 'concierge/dashboard';
    if (pageKey === 'queue') return 'concierge/queue?limit=25&assignment=MINE';
    if (
      resourceId &&
      ['cases', 'matching', 'scheduling', 'aftercare', 'incidents', 'tasks'].includes(pageKey)
    )
      return `concierge/cases/${resourceId}`;
    return null;
  }
  if (area === 'verification') {
    if (pageKey === 'dashboard') return 'verification/cases?limit=25';
    if (pageKey === 'corrective')
      return resourceId
        ? `verification/corrective-actions/${resourceId}`
        : 'verification/cases?status=ADDITIONAL_INFORMATION_REQUIRED&limit=25';
    if (pageKey === 'expiring') return 'verification/cases?status=VERIFICATION_EXPIRING&limit=25';
    if (pageKey === 'suspension') return 'verification/cases?status=SUSPENDED&limit=25';
    if (pageKey === 'clinic')
      return resourceId
        ? `verification/cases/${resourceId}`
        : 'verification/cases?subjectType=CLINIC&limit=25';
    if (pageKey === 'dentist')
      return resourceId
        ? `verification/cases/${resourceId}`
        : 'verification/cases?subjectType=DENTIST&limit=25';
    if (pageKey === 'audit')
      return resourceId
        ? `verification/site-audits/${resourceId}`
        : 'verification/cases?status=SITE_AUDIT_REQUIRED&limit=25';
    return null;
  }
  if (pageKey === 'dashboard' || pageKey === 'cases') return 'cases?limit=25';
  if (pageKey === 'case' && resourceId) return `cases/${resourceId}`;
  if (pageKey === 'records' && resourceId) return `cases/${resourceId}/documents`;
  if (pageKey === 'plans' && resourceId) return `cases/${resourceId}/treatment-plans`;
  if (pageKey === 'aftercare' && resourceId) return `cases/${resourceId}/aftercare`;
  if (pageKey === 'caregivers' && resourceId) return `cases/${resourceId}/caregivers`;
  if ((pageKey === 'journey' || pageKey === 'progress') && resourceId)
    return `cases/${resourceId}/journey`;
  if (pageKey === 'passport' && resourceId) return `cases/${resourceId}/passport`;
  if (area === 'clinic' && pageKey === 'planBuilder' && resourceId)
    return `cases/${resourceId}/treatment-plans`;
  if ((pageKey === 'consultations' || pageKey === 'scheduling') && resourceId)
    return `cases/${resourceId}/appointments`;
  if (pageKey === 'messages' && resourceId && threadId && view === 'internal-notes')
    return area === 'clinic' ? `cases/${resourceId}/threads/${threadId}/internal-notes` : null;
  if (pageKey === 'messages' && resourceId && threadId)
    return `cases/${resourceId}/threads/${threadId}/messages`;
  if (pageKey === 'messages' && resourceId) return `cases/${resourceId}/threads`;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const area = url.searchParams.get('area') as PortalArea | null;
  const pageKey = url.searchParams.get('pageKey');
  const candidateId = url.searchParams.get('resourceId');
  const candidateThreadId = url.searchParams.get('threadId');
  const view = url.searchParams.get('view') ?? undefined;
  if (!area || !areas.has(area) || !pageKey)
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const resourceId = candidateId && uuidPattern.test(candidateId) ? candidateId : undefined;
  const threadId =
    candidateThreadId && uuidPattern.test(candidateThreadId) ? candidateThreadId : undefined;
  if (candidateThreadId && !threadId)
    return NextResponse.json({ error: 'invalid_thread_id' }, { status: 400 });
  if (view && view !== 'internal-notes')
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  if (resourcePages.has(`${area}:${pageKey}`) && !resourceId)
    return NextResponse.json({ error: 'invalid_resource_id' }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await authorizePortalRoute(session, area, pageKey, resourceId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (session.source === 'development')
    return NextResponse.json({
      data: developmentData(area, pageKey, threadId, view, resourceId),
      adapter: 'development',
    });
  const path = upstreamPath(area, pageKey, resourceId, threadId, view);
  const api = process.env.NEXT_PUBLIC_API_URL;
  const token = (await cookies()).get('dt_session')?.value;
  if (!path || !api || !token)
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const upstream = await fetch(`${api}/${path}`, {
      headers: sessionApiHeaders(session, token),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
