import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import argon2 from 'argon2';

import { PrismaClient, type SystemRole, type VerificationStatus } from '@prisma/client';

import {
  canonicalPassportContent,
  permissions,
  rolePermissions,
  systemRoles,
} from '@dental-trust/domain';

loadSeedEnvironment();

const db = new PrismaClient();
const DEVELOPMENT_PASSWORD = 'DentalTrustDev!2026';
const TERMS_VERSION = '2026-07-12';

function loadSeedEnvironment(): void {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') return;
  try {
    process.loadEnvFile(
      process.env.DENTAL_TRUST_ENV_FILE ?? resolve(import.meta.dirname, '../../../.env'),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      (error as Error & { readonly code?: string }).code !== 'ENOENT'
    ) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed is disabled in production.');
  }

  const passwordHash = await argon2.hash(
    process.env.DENTAL_TRUST_SEED_PASSWORD ?? DEVELOPMENT_PASSWORD,
    { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 },
  );

  const roleIds = await seedAuthorizationDefinitions();
  await seedConsentTexts();

  const admin = await upsertUser('admin@dentaltrust.local', ['SUPER_ADMIN'], roleIds, passwordHash);
  const patient = await upsertUser(
    'patient@dentaltrust.local',
    ['PATIENT'],
    roleIds,
    passwordHash,
    true,
  );
  const caregiver = await upsertUser(
    'caregiver@dentaltrust.local',
    ['CAREGIVER'],
    roleIds,
    passwordHash,
  );
  const concierge = await upsertUser(
    'concierge@dentaltrust.local',
    ['CONCIERGE_AGENT'],
    roleIds,
    passwordHash,
  );
  const verification = await upsertUser(
    'verification@dentaltrust.local',
    ['VERIFICATION_OFFICER'],
    roleIds,
    passwordHash,
  );
  const clinicAdmin = await upsertUser(
    'clinic.admin@saigon-smiles.local',
    ['CLINIC_ADMIN'],
    roleIds,
    passwordHash,
  );
  const dentistUser = await upsertUser(
    'dentist@saigon-smiles.local',
    ['DENTIST'],
    roleIds,
    passwordHash,
  );
  await seedUserConsents(patient.id, 'vi-VN');

  const platform = await db.organization.upsert({
    where: { slug: 'dental-trust-platform' },
    update: { name: 'DENTAL TRUST Platform' },
    create: { type: 'PLATFORM', name: 'DENTAL TRUST Platform', slug: 'dental-trust-platform' },
  });
  const conciergeOrganization = await db.organization.upsert({
    where: { slug: 'dental-trust-concierge' },
    update: { name: 'DENTAL TRUST Concierge' },
    create: {
      type: 'CONCIERGE',
      name: 'DENTAL TRUST Concierge',
      slug: 'dental-trust-concierge',
    },
  });
  await db.organizationMembership.upsert({
    where: {
      organizationId_userId_roleId: {
        organizationId: conciergeOrganization.id,
        userId: concierge.id,
        roleId: roleIds.CONCIERGE_AGENT,
      },
    },
    update: { status: 'ACTIVE', acceptedAt: new Date() },
    create: {
      organizationId: conciergeOrganization.id,
      userId: concierge.id,
      roleId: roleIds.CONCIERGE_AGENT,
      status: 'ACTIVE',
      acceptedAt: new Date(),
    },
  });
  await db.organizationMembership.upsert({
    where: {
      organizationId_userId_roleId: {
        organizationId: conciergeOrganization.id,
        userId: admin.id,
        roleId: roleIds.CONCIERGE_AGENT,
      },
    },
    update: { status: 'ACTIVE', acceptedAt: new Date() },
    create: {
      organizationId: conciergeOrganization.id,
      userId: admin.id,
      roleId: roleIds.CONCIERGE_AGENT,
      status: 'ACTIVE',
      acceptedAt: new Date(),
    },
  });
  await db.organizationMembership.upsert({
    where: {
      organizationId_userId_roleId: {
        organizationId: platform.id,
        userId: concierge.id,
        roleId: roleIds.CONCIERGE_AGENT,
      },
    },
    update: { status: 'ACTIVE', acceptedAt: new Date() },
    create: {
      organizationId: platform.id,
      userId: concierge.id,
      roleId: roleIds.CONCIERGE_AGENT,
      status: 'ACTIVE',
      acceptedAt: new Date(),
    },
  });
  await db.organizationMembership.upsert({
    where: {
      organizationId_userId_roleId: {
        organizationId: platform.id,
        userId: verification.id,
        roleId: roleIds.VERIFICATION_OFFICER,
      },
    },
    update: { status: 'ACTIVE', acceptedAt: new Date() },
    create: {
      organizationId: platform.id,
      userId: verification.id,
      roleId: roleIds.VERIFICATION_OFFICER,
      status: 'ACTIVE',
      acceptedAt: new Date(),
    },
  });

  const category = await db.serviceCategory.upsert({
    where: { code: 'RESTORATIVE_DENTISTRY' },
    update: { active: true },
    create: {
      code: 'RESTORATIVE_DENTISTRY',
      names: { 'vi-VN': 'Nha khoa phục hồi', 'en-US': 'Restorative dentistry' },
    },
  });
  const implantProcedure = await db.procedureDefinition.upsert({
    where: { code: 'DENTAL_IMPLANT' },
    update: { active: true },
    create: {
      serviceCategoryId: category.id,
      code: 'DENTAL_IMPLANT',
      names: { 'vi-VN': 'Cấy ghép Implant', 'en-US': 'Dental implant' },
      descriptions: {
        'vi-VN': 'Phục hồi răng bằng trụ implant theo chỉ định của bác sĩ.',
        'en-US': 'Provider-directed restoration using a dental implant system.',
      },
    },
  });
  await seedAdminGovernance(admin.id);

  const clinicLocations = [
    {
      name: 'Cơ sở Nguyễn Huệ',
      address: '22 Nguyễn Huệ, Phường Bến Nghé',
      district: 'Quận 1',
      latitude: 10.77392,
      longitude: 106.70335,
    },
    {
      name: 'Cơ sở Lê Lợi',
      address: '65 Lê Lợi, Phường Bến Nghé',
      district: 'Quận 1',
      latitude: 10.77337,
      longitude: 106.70033,
    },
    {
      name: 'Cơ sở Võ Văn Tần',
      address: '157 Võ Văn Tần, Phường Võ Thị Sáu',
      district: 'Quận 3',
      latitude: 10.77565,
      longitude: 106.69083,
    },
    {
      name: 'Cơ sở Nguyễn Thị Minh Khai',
      address: '41 Nguyễn Thị Minh Khai, Phường Bến Nghé',
      district: 'Quận 1',
      latitude: 10.78178,
      longitude: 106.69808,
    },
    {
      name: 'Cơ sở Nguyễn Du',
      address: '92 Nguyễn Du, Phường Bến Nghé',
      district: 'Quận 1',
      latitude: 10.77922,
      longitude: 106.69679,
    },
    {
      name: 'Cơ sở Hai Bà Trưng',
      address: '74 Hai Bà Trưng, Phường Bến Nghé',
      district: 'Quận 1',
      latitude: 10.78074,
      longitude: 106.70286,
    },
    {
      name: 'Cơ sở Đinh Tiên Hoàng',
      address: '12 Đinh Tiên Hoàng, Phường Đa Kao',
      district: 'Quận 1',
      latitude: 10.78854,
      longitude: 106.70227,
    },
    {
      name: 'Cơ sở Cách Mạng Tháng Tám',
      address: '258 Cách Mạng Tháng Tám, Phường 10',
      district: 'Quận 3',
      latitude: 10.78394,
      longitude: 106.67965,
    },
    {
      name: 'Cơ sở Trần Hưng Đạo',
      address: '20 Trần Hưng Đạo, Phường Cầu Kho',
      district: 'Quận 1',
      latitude: 10.76392,
      longitude: 106.6937,
    },
    {
      name: 'Cơ sở Phạm Ngũ Lão',
      address: '189 Nguyễn Thị Minh Khai, Phường Phạm Ngũ Lão',
      district: 'Quận 1',
      latitude: 10.77062,
      longitude: 106.68888,
    },
  ] as const;
  const clinicRecords = [];
  for (let index = 1; index <= 10; index += 1) {
    const slug = index === 1 ? 'saigon-smiles' : `verified-dental-clinic-${index}`;
    const name = index === 1 ? 'Saigon Smiles Dental Center' : `Verified Dental Clinic ${index}`;
    const organization = await db.organization.upsert({
      where: { slug },
      update: { name },
      create: { type: 'CLINIC', name, slug },
    });
    const clinic = await db.clinic.upsert({
      where: { organizationId: organization.id },
      update: {
        name,
        verificationStatus: 'NOT_SUBMITTED',
        verifiedAt: null,
      },
      create: {
        organizationId: organization.id,
        name,
        slug,
        legalEntityName: `${name} Company Limited`,
        verificationStatus: 'NOT_SUBMITTED',
      },
    });
    await db.clinicOnboardingProfile.upsert({
      where: { clinicId: clinic.id },
      update: {
        registrationNumber: `VN-DENTAL-${String(index).padStart(4, '0')}`,
        registrationCountry: 'VN',
      },
      create: {
        clinicId: clinic.id,
        registrationNumber: `VN-DENTAL-${String(index).padStart(4, '0')}`,
        registrationCountry: 'VN',
      },
    });
    await db.clinicSchedulingPolicy.upsert({
      where: { clinicId: clinic.id },
      update: {},
      create: { clinicId: clinic.id },
    });
    await db.professionalLicense.upsert({
      where: {
        authority_licenseNumber: {
          authority: 'Ho Chi Minh City Department of Health',
          licenseNumber: `HCM-CLINIC-${String(index).padStart(4, '0')}`,
        },
      },
      update: {
        clinicId: clinic.id,
        status: 'VERIFIED',
        verifiedAt: new Date('2026-06-01T00:00:00Z'),
        expiresAt: new Date('2028-06-01T00:00:00Z'),
      },
      create: {
        clinicId: clinic.id,
        authority: 'Ho Chi Minh City Department of Health',
        licenseNumber: `HCM-CLINIC-${String(index).padStart(4, '0')}`,
        scopeOfPractice: 'Licensed dental clinic',
        issuedAt: new Date('2025-06-01T00:00:00Z'),
        expiresAt: new Date('2028-06-01T00:00:00Z'),
        status: 'VERIFIED',
        verifiedAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
    const clinicLocation = clinicLocations[index - 1];
    if (!clinicLocation) {
      throw new Error(`Missing development location for clinic ${index}.`);
    }
    const existingLocation = await db.clinicLocation.findFirst({ where: { clinicId: clinic.id } });
    const location = existingLocation
      ? await db.clinicLocation.update({
          where: { id: existingLocation.id },
          data: {
            ...clinicLocation,
            city: 'TP. Hồ Chí Minh',
            timezone: 'Asia/Ho_Chi_Minh',
            active: true,
          },
        })
      : await db.clinicLocation.create({
          data: {
            clinicId: clinic.id,
            ...clinicLocation,
            city: 'TP. Hồ Chí Minh',
            timezone: 'Asia/Ho_Chi_Minh',
          },
        });
    const warranty =
      (await db.warrantyPolicy.findFirst({
        where: { clinicId: clinic.id, name: 'Standard implant warranty' },
      })) ??
      (await db.warrantyPolicy.create({
        data: {
          clinicId: clinic.id,
          name: 'Standard implant warranty',
          terms: {
            durationMonths: 60,
            exclusions: ['Trauma', 'Failure to attend required follow-up'],
          },
          effectiveAt: new Date('2026-01-01T00:00:00Z'),
        },
      }));
    const service = await db.clinicService.upsert({
      where: {
        clinicId_procedureDefinitionId: {
          clinicId: clinic.id,
          procedureDefinitionId: implantProcedure.id,
        },
      },
      update: { active: true, warrantyPolicyId: warranty.id },
      create: {
        clinicId: clinic.id,
        procedureDefinitionId: implantProcedure.id,
        warrantyPolicyId: warranty.id,
        displayNames: { 'vi-VN': 'Trồng răng Implant', 'en-US': 'Dental implant treatment' },
        includedServices: ['Initial consultation', 'Standard follow-up'],
        exclusions: ['Bone graft when clinically required'],
        estimatedDurationDays: 7,
      },
    });
    await db.priceVersion.upsert({
      where: {
        clinicServiceId_effectiveAt: {
          clinicServiceId: service.id,
          effectiveAt: new Date('2026-01-01T00:00:00Z'),
        },
      },
      update: {},
      create: {
        clinicServiceId: service.id,
        minimumMinor: BigInt(20_000_000),
        maximumMinor: BigInt(45_000_000),
        currency: 'VND',
        effectiveAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    clinicRecords.push({ clinic, organization, location });
  }

  const primary = clinicRecords[0];
  if (!primary) throw new Error('Primary development clinic was not created.');
  const adminMembership = await upsertMembership(
    primary.organization.id,
    clinicAdmin.id,
    roleIds.CLINIC_ADMIN,
  );
  await db.clinicStaff.upsert({
    where: { membershipId: adminMembership.id },
    update: { active: true },
    create: {
      clinicId: primary.clinic.id,
      userId: clinicAdmin.id,
      membershipId: adminMembership.id,
      clinicLocationId: primary.location.id,
      jobTitle: 'Clinic administrator',
    },
  });
  await upsertMembership(primary.organization.id, dentistUser.id, roleIds.DENTIST);

  const dentistRecords = [];
  for (let index = 1; index <= 20; index += 1) {
    const clinic = clinicRecords[(index - 1) % clinicRecords.length];
    if (!clinic) continue;
    const dentistSlug = index === 1 ? 'dr-minh-nguyen' : `development-dentist-${index}`;
    const dentist = await db.dentist.upsert({
      where: { licenseNumber: `HCM-DDS-${String(index).padStart(4, '0')}` },
      update: {
        slug: dentistSlug,
        licenseStatus: 'NOT_SUBMITTED',
        ...(index === 1 ? { userId: dentistUser.id } : {}),
      },
      create: {
        ...(index === 1 ? { userId: dentistUser.id } : {}),
        slug: dentistSlug,
        fullName: index === 1 ? 'Dr. Minh Nguyen' : `Dr. Development Dentist ${index}`,
        licenseNumber: `HCM-DDS-${String(index).padStart(4, '0')}`,
        licenseStatus: 'NOT_SUBMITTED',
      },
    });
    await db.professionalLicense.upsert({
      where: {
        authority_licenseNumber: {
          authority: 'Ho Chi Minh City Department of Health',
          licenseNumber: dentist.licenseNumber,
        },
      },
      update: {
        dentistId: dentist.id,
        status: 'VERIFIED',
        verifiedAt: new Date('2026-06-01T00:00:00Z'),
        expiresAt: new Date('2028-06-01T00:00:00Z'),
      },
      create: {
        dentistId: dentist.id,
        authority: 'Ho Chi Minh City Department of Health',
        licenseNumber: dentist.licenseNumber,
        scopeOfPractice: 'General dentistry and implant restorative care',
        issuedAt: new Date('2025-06-01T00:00:00Z'),
        expiresAt: new Date('2028-06-01T00:00:00Z'),
        status: 'VERIFIED',
        verifiedAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
    const affiliation = await db.dentistClinicAffiliation.findFirst({
      where: { dentistId: dentist.id, clinicId: clinic.clinic.id, endedAt: null },
    });
    if (!affiliation) {
      await db.dentistClinicAffiliation.create({
        data: {
          dentistId: dentist.id,
          clinicId: clinic.clinic.id,
          startedAt: new Date('2025-01-01T00:00:00Z'),
        },
      });
    }
    dentistRecords.push(dentist);
  }

  for (const { clinic } of clinicRecords) {
    await seedVerifiedSubject({
      subjectType: 'CLINIC',
      subjectId: clinic.id,
      submitterUserId: clinicAdmin.id,
      reviewerUserId: verification.id,
      secondApproverUserId: admin.id,
    });
  }
  for (const seededDentist of dentistRecords) {
    await seedVerifiedSubject({
      subjectType: 'DENTIST',
      subjectId: seededDentist.id,
      submitterUserId: clinicAdmin.id,
      reviewerUserId: verification.id,
      secondApproverUserId: admin.id,
    });
  }
  await seedVerificationWorkflowDemos({
    submitterUserId: clinicAdmin.id,
    primaryReviewerUserId: verification.id,
    administratorReviewerUserId: admin.id,
  });

  const patientProfile = await db.patientProfile.findUniqueOrThrow({
    where: { userId: patient.id },
  });
  const dentalCase = await db.dentalCase.upsert({
    where: { caseNumber: 'DT-DEV-0001' },
    update: {},
    create: {
      caseNumber: 'DT-DEV-0001',
      patientProfileId: patientProfile.id,
      title: 'Implant consultation for Vietnam visit',
      desiredProcedureCode: 'DENTAL_IMPLANT',
      preferredLocation: 'Ho Chi Minh City',
      expectedArrivalDate: new Date('2026-10-10T00:00:00Z'),
      expectedDepartureDate: new Date('2026-10-24T00:00:00Z'),
      preferredCurrency: 'USD',
      status: 'TREATMENT_PLANS_READY',
      statusHistory: {
        create: {
          toStatus: 'TREATMENT_PLANS_READY',
          actorUserId: admin.id,
          reason: 'Development seed state.',
          requestId: 'seed-development',
        },
      },
    },
  });
  const grant = await db.caregiverGrant.findFirst({
    where: { caseId: dentalCase.id, caregiverUserId: caregiver.id, revokedAt: null },
  });
  if (!grant) {
    await db.caregiverGrant.create({
      data: {
        caseId: dentalCase.id,
        patientProfileId: patientProfile.id,
        caregiverUserId: caregiver.id,
        permissions: ['VIEW_CASE_SUMMARY', 'VIEW_APPOINTMENTS', 'VIEW_TREATMENT_PLANS'],
      },
    });
  }
  const clinicAssignment = await db.caseAssignment.findFirst({
    where: { caseId: dentalCase.id, organizationId: primary.organization.id, endedAt: null },
  });
  if (!clinicAssignment) {
    await db.caseAssignment.create({
      data: {
        caseId: dentalCase.id,
        kind: 'CLINIC',
        organizationId: primary.organization.id,
      },
    });
  }
  const treatmentPlan = await db.treatmentPlan.upsert({
    where: { caseId_clinicId: { caseId: dentalCase.id, clinicId: primary.clinic.id } },
    update: {},
    create: { caseId: dentalCase.id, clinicId: primary.clinic.id },
  });
  const dentist = dentistRecords[0];
  if (!dentist) throw new Error('Development dentist was not created.');
  let planVersion = await db.treatmentPlanVersion.upsert({
    where: { treatmentPlanId_version: { treatmentPlanId: treatmentPlan.id, version: 1 } },
    update: {},
    create: {
      treatmentPlanId: treatmentPlan.id,
      version: 1,
      status: 'DRAFT',
      authoringDentistId: dentist.id,
      preliminaryAssessment:
        'Preliminary assessment based on uploaded records; in-person examination required.',
      diagnosisStatement: 'Provider-supplied preliminary diagnosis for development data.',
      risks: 'Clinical risks require discussion with the treating dentist.',
      limitations: 'Final plan depends on an in-person examination.',
      warrantyTerms: 'See clinic warranty policy.',
      exclusions: 'Bone graft and unrelated procedures are excluded.',
      currency: 'USD',
      totalMinor: BigInt(2_500_00),
      expiresAt: new Date('2026-12-31T23:59:59Z'),
      publishedAt: new Date('2026-07-01T00:00:00Z'),
      contentChecksum: 'a'.repeat(64),
      items: {
        create: {
          procedureCode: 'DENTAL_IMPLANT',
          toothNumbers: [11],
          quantity: 1,
          brand: 'Development implant system',
          unitPriceMinor: BigInt(2_500_00),
          totalPriceMinor: BigInt(2_500_00),
          sortOrder: 1,
        },
      },
    },
  });
  if (planVersion.status === 'DRAFT') {
    planVersion = await db.treatmentPlanVersion.update({
      where: { id: planVersion.id },
      data: { status: 'PUBLISHED' },
    });
  }

  const seedSession = await db.session.upsert({
    where: { tokenHash: createHash('sha256').update('seed-patient-session').digest('hex') },
    update: { expiresAt: new Date('2030-01-01T00:00:00Z'), revokedAt: null },
    create: {
      id: '00000000-0000-4000-8000-000000000006',
      userId: patient.id,
      tokenHash: createHash('sha256').update('seed-patient-session').digest('hex'),
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      ipAddressHash: createHash('sha256').update('127.0.0.1').digest('hex'),
      userAgent: 'DENTAL TRUST development seed',
    },
  });
  await seedPatientOnboarding({
    patientUserId: patient.id,
    patientProfileId: patientProfile.id,
    caseId: dentalCase.id,
    patientSessionId: seedSession.id,
  });
  const treatmentConsent = await db.consentTextVersion.findUniqueOrThrow({
    where: {
      purpose_version_locale: {
        purpose: 'TREATMENT_PLAN_ACCEPTANCE',
        version: TERMS_VERSION,
        locale: 'vi-VN',
      },
    },
  });
  const planAcceptance = await db.treatmentPlanAcceptance.upsert({
    where: {
      treatmentPlanVersionId_userId: {
        treatmentPlanVersionId: planVersion.id,
        userId: patient.id,
      },
    },
    update: {},
    create: {
      treatmentPlanVersionId: planVersion.id,
      userId: patient.id,
      consentTextVersionId: treatmentConsent.id,
      sessionId: seedSession.id,
      requestId: 'seed-plan-acceptance',
    },
  });
  await seedBookingConfiguration(admin.id);

  await seedOperationalJourneys({
    adminUserId: admin.id,
    patientUserId: patient.id,
    patientProfileId: patientProfile.id,
    clinicId: primary.clinic.id,
    dentistId: dentist.id,
    dentistUserId: dentistUser.id,
    primaryCaseId: dentalCase.id,
    planVersionId: planVersion.id,
    planAcceptanceId: planAcceptance.id,
    patientSessionId: seedSession.id,
    treatmentConsentTextVersionId: treatmentConsent.id,
  });
  await seedConciergeMatching({
    patientUserId: patient.id,
    conciergeUserId: concierge.id,
    supervisorUserId: admin.id,
    conciergeOrganizationId: conciergeOrganization.id,
    caseId: dentalCase.id,
    clinics: clinicRecords.map(({ clinic }) => clinic.id),
  });

  console.info(
    'Seeded DENTAL TRUST development data. Credentials are documented in local-development documentation.',
  );
}

async function seedAdminGovernance(administratorUserId: string): Promise<void> {
  const publishedAt = new Date('2026-07-12T00:00:00Z');
  for (const page of [
    {
      locale: 'vi-VN',
      title: 'Cam kết an toàn cho bệnh nhân',
      summary: 'Cách Dental Trust bảo vệ bệnh nhân trong suốt hành trình chăm sóc.',
      body: 'Dental Trust xác minh nhà cung cấp, lưu lịch sử quyết định và giữ hồ sơ nhạy cảm trong cổng bảo mật.',
    },
    {
      locale: 'en-US',
      title: 'Patient safety commitments',
      summary: 'How Dental Trust protects patients throughout the care journey.',
      body: 'Dental Trust verifies providers, preserves decision history, and keeps sensitive records inside the secure portal.',
    },
  ] as const) {
    const existing = await db.contentPage.findUnique({
      where: {
        slug_locale_version: { slug: 'patient-safety', locale: page.locale, version: 1 },
      },
    });
    if (!existing) {
      await db.contentPage.create({
        data: {
          slug: 'patient-safety',
          locale: page.locale,
          version: 1,
          title: page.title,
          summary: page.summary,
          body: page.body,
          publicationStatus: 'PUBLISHED',
          publishedAt,
          createdByUserId: administratorUserId,
        },
      });
    }
  }

  const featureFlag = await db.featureFlag.upsert({
    where: { key: 'patient.passport-sharing' },
    update: {},
    create: {
      key: 'patient.passport-sharing',
      description: 'Controls secure, time-limited patient Passport sharing.',
    },
  });
  const existingFeatureVersion = await db.featureFlagVersion.findUnique({
    where: { featureFlagId_version: { featureFlagId: featureFlag.id, version: 1 } },
  });
  if (!existingFeatureVersion) {
    await db.featureFlagVersion.create({
      data: {
        featureFlagId: featureFlag.id,
        version: 1,
        enabled: true,
        environment: 'development',
        audiences: ['PATIENT'],
        reason: 'Initial approved development feature baseline.',
        changedByUserId: administratorUserId,
      },
    });
  }

  for (const template of [
    {
      locale: 'vi-VN',
      subject: 'Hồ sơ Dental Trust đã được cập nhật',
      body: 'Một cập nhật hồ sơ mới đang chờ bạn trong cổng Dental Trust bảo mật.',
    },
    {
      locale: 'en-US',
      subject: 'Your Dental Trust case was updated',
      body: 'A new case update is waiting for you in the secure Dental Trust portal.',
    },
  ] as const) {
    const parent = await db.notificationTemplate.upsert({
      where: {
        key_channel_locale: { key: 'case.updated', channel: 'EMAIL', locale: template.locale },
      },
      update: {},
      create: {
        key: 'case.updated',
        category: 'CASE_UPDATES',
        channel: 'EMAIL',
        locale: template.locale,
      },
    });
    const existingTemplateVersion = await db.notificationTemplateVersion.findUnique({
      where: { templateId_version: { templateId: parent.id, version: 1 } },
    });
    if (!existingTemplateVersion) {
      await db.notificationTemplateVersion.create({
        data: {
          templateId: parent.id,
          version: 1,
          subject: template.subject,
          body: template.body,
          publicationStatus: 'PUBLISHED',
          reason: 'Initial approved localized notification copy.',
          createdByUserId: administratorUserId,
        },
      });
    }
  }

  const configuration = await db.systemConfiguration.upsert({
    where: { key: 'booking.deposit-percent' },
    update: {},
    create: {
      key: 'booking.deposit-percent',
      description: 'Default booking deposit percentage.',
      valueType: 'INTEGER',
      secret: false,
    },
  });
  const existingConfigurationVersion = await db.systemConfigurationVersion.findUnique({
    where: { configurationId_version: { configurationId: configuration.id, version: 1 } },
  });
  if (!existingConfigurationVersion) {
    await db.systemConfigurationVersion.create({
      data: {
        configurationId: configuration.id,
        version: 1,
        value: '20',
        reason: 'Initial approved booking deposit policy.',
        changedByUserId: administratorUserId,
      },
    });
  }

  const country = await db.countryConfiguration.upsert({
    where: { code: 'VN' },
    update: { active: true, updatedByUserId: administratorUserId },
    create: {
      code: 'VN',
      names: { 'vi-VN': 'Việt Nam', 'en-US': 'Vietnam' },
      currency: 'VND',
      callingCode: '+84',
      updatedByUserId: administratorUserId,
    },
  });
  await db.cityConfiguration.upsert({
    where: { countryId_code: { countryId: country.id, code: 'ho-chi-minh-city' } },
    update: { active: true, updatedByUserId: administratorUserId },
    create: {
      countryId: country.id,
      code: 'ho-chi-minh-city',
      names: { 'vi-VN': 'Thành phố Hồ Chí Minh', 'en-US': 'Ho Chi Minh City' },
      timezone: 'Asia/Ho_Chi_Minh',
      updatedByUserId: administratorUserId,
    },
  });
  await db.localeConfiguration.updateMany({
    where: { isDefault: true, locale: { not: 'vi-VN' } },
    data: { isDefault: false, updatedByUserId: administratorUserId },
  });
  for (const locale of [
    { locale: 'vi-VN', names: { 'vi-VN': 'Tiếng Việt', 'en-US': 'Vietnamese' }, isDefault: true },
    { locale: 'en-US', names: { 'vi-VN': 'Tiếng Anh', 'en-US': 'English' }, isDefault: false },
  ] as const) {
    await db.localeConfiguration.upsert({
      where: { locale: locale.locale },
      update: {
        names: locale.names,
        active: true,
        isDefault: locale.isDefault,
        updatedByUserId: administratorUserId,
      },
      create: {
        locale: locale.locale,
        names: locale.names,
        active: true,
        isDefault: locale.isDefault,
        updatedByUserId: administratorUserId,
      },
    });
  }
}

async function seedVerifiedSubject(input: {
  readonly subjectType: 'CLINIC' | 'DENTIST';
  readonly subjectId: string;
  readonly submitterUserId: string;
  readonly reviewerUserId: string;
  readonly secondApproverUserId: string;
}): Promise<void> {
  const subjectWhere =
    input.subjectType === 'CLINIC'
      ? { subjectType: 'CLINIC' as const, clinicId: input.subjectId }
      : { subjectType: 'DENTIST' as const, dentistId: input.subjectId };
  let verificationCase = await db.verificationCase.findFirst({ where: subjectWhere });
  if (!verificationCase) {
    verificationCase = await db.verificationCase.create({
      data: {
        subjectType: input.subjectType,
        ...(input.subjectType === 'CLINIC'
          ? { clinicId: input.subjectId }
          : { dentistId: input.subjectId }),
        submittedByUserId: input.submitterUserId,
        assignedReviewerUserId: input.reviewerUserId,
        status: 'DRAFT',
        riskLevel: 'HIGH',
        version: 1,
      },
    });
  }

  const templates = await db.verificationRequirementTemplate.findMany({
    where: { subjectType: input.subjectType, active: true },
    orderBy: { code: 'asc' },
  });
  if (templates.length === 0) {
    throw new Error(`No verification checklist exists for ${input.subjectType}.`);
  }
  for (const template of templates) {
    const requirement = await db.verificationRequirement.upsert({
      where: {
        verificationCaseId_templateId: {
          verificationCaseId: verificationCase.id,
          templateId: template.id,
        },
      },
      update: { status: 'APPROVED' },
      create: {
        verificationCaseId: verificationCase.id,
        templateId: template.id,
        status: 'APPROVED',
        required: template.required,
        highRisk: template.highRisk,
      },
    });
    const evidence = await db.verificationEvidence.findFirst({
      where: { requirementId: requirement.id, revokedAt: null },
    });
    if (!evidence) {
      await db.verificationEvidence.create({
        data: {
          verificationCaseId: verificationCase.id,
          requirementId: requirement.id,
          submittedByUserId: input.submitterUserId,
          approvedByUserId: input.reviewerUserId,
          category: template.category,
          sourceReference: `Development registry reference: ${template.code}`,
          approvedAt: new Date('2026-06-01T00:00:00Z'),
          expiresAt: new Date('2027-06-01T00:00:00Z'),
        },
      });
    }
  }

  if (verificationCase.status === 'DRAFT') {
    verificationCase = await db.verificationCase.update({
      where: { id: verificationCase.id },
      data: {
        status: 'SUBMITTED',
        version: { increment: 1 },
        submittedAt: new Date('2026-05-01T00:00:00Z'),
      },
    });
  }
  if (verificationCase.status === 'SUBMITTED') {
    verificationCase = await applySeedVerificationReview(
      verificationCase,
      'UNDER_REVIEW',
      input,
      false,
    );
  }
  if (verificationCase.status === 'UNDER_REVIEW') {
    verificationCase = await applySeedVerificationReview(
      verificationCase,
      'APPROVED',
      input,
      false,
    );
  }
  if (verificationCase.status === 'APPROVED') {
    await applySeedVerificationReview(verificationCase, 'VERIFIED', input, true);
  } else if (verificationCase.status !== 'VERIFIED') {
    throw new Error(
      `Development verification fixture ${verificationCase.id} is in unexpected status ${verificationCase.status}.`,
    );
  }

  if (input.subjectType === 'CLINIC') {
    await db.clinic.update({
      where: { id: input.subjectId },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
  } else {
    await db.dentist.update({
      where: { id: input.subjectId },
      data: { licenseStatus: 'VERIFIED' },
    });
  }
}

async function seedVerificationWorkflowDemos(input: {
  readonly submitterUserId: string;
  readonly primaryReviewerUserId: string;
  readonly administratorReviewerUserId: string;
}): Promise<void> {
  const evidenceReviewCaseId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  const secondApprovalCaseId = 'ffffffff-ffff-4fff-8fff-fffffffffff2';
  const demoCaseIds = [evidenceReviewCaseId, secondApprovalCaseId];

  await db.$transaction(async (transaction) => {
    await transaction.siteAuditAttachment.deleteMany({
      where: { siteAudit: { verificationCaseId: { in: demoCaseIds } } },
    });
    await transaction.correctiveActionAttachment.deleteMany({
      where: { correctiveAction: { verificationCaseId: { in: demoCaseIds } } },
    });
    await transaction.siteAudit.deleteMany({
      where: { verificationCaseId: { in: demoCaseIds } },
    });
    await transaction.correctiveAction.deleteMany({
      where: { verificationCaseId: { in: demoCaseIds } },
    });
    await transaction.verificationReview.deleteMany({
      where: { verificationCaseId: { in: demoCaseIds } },
    });
    await transaction.verificationEvidence.deleteMany({
      where: { verificationCaseId: { in: demoCaseIds } },
    });
    await transaction.verificationRequirement.deleteMany({
      where: { verificationCaseId: { in: demoCaseIds } },
    });
    await transaction.verificationCase.deleteMany({ where: { id: { in: demoCaseIds } } });
  });

  const evidenceReviewOrganization = await db.organization.upsert({
    where: { slug: 'verification-demo-evidence-review' },
    update: { name: '[DEMO 1] Chờ duyệt bằng chứng' },
    create: {
      id: 'd0000000-0000-4000-8000-000000000001',
      type: 'CLINIC',
      name: '[DEMO 1] Chờ duyệt bằng chứng',
      slug: 'verification-demo-evidence-review',
    },
  });
  const evidenceReviewClinic = await db.clinic.upsert({
    where: { organizationId: evidenceReviewOrganization.id },
    update: {
      name: '[DEMO 1] Chờ duyệt bằng chứng',
      legalEntityName: '[DEMO 1] Chờ duyệt bằng chứng',
      verificationStatus: 'SUBMITTED',
      verifiedAt: null,
    },
    create: {
      id: 'd1000000-0000-4000-8000-000000000001',
      organizationId: evidenceReviewOrganization.id,
      name: '[DEMO 1] Chờ duyệt bằng chứng',
      slug: 'verification-demo-evidence-review',
      legalEntityName: '[DEMO 1] Chờ duyệt bằng chứng',
      verificationStatus: 'SUBMITTED',
    },
  });

  const secondApprovalOrganization = await db.organization.upsert({
    where: { slug: 'verification-demo-second-approval' },
    update: { name: '[DEMO 2] Chờ phê duyệt kép' },
    create: {
      id: 'd0000000-0000-4000-8000-000000000002',
      type: 'CLINIC',
      name: '[DEMO 2] Chờ phê duyệt kép',
      slug: 'verification-demo-second-approval',
    },
  });
  const secondApprovalClinic = await db.clinic.upsert({
    where: { organizationId: secondApprovalOrganization.id },
    update: {
      name: '[DEMO 2] Chờ phê duyệt kép',
      legalEntityName: '[DEMO 2] Chờ phê duyệt kép',
      verificationStatus: 'UNDER_REVIEW',
      verifiedAt: null,
    },
    create: {
      id: 'd1000000-0000-4000-8000-000000000002',
      organizationId: secondApprovalOrganization.id,
      name: '[DEMO 2] Chờ phê duyệt kép',
      slug: 'verification-demo-second-approval',
      legalEntityName: '[DEMO 2] Chờ phê duyệt kép',
      verificationStatus: 'UNDER_REVIEW',
    },
  });

  const evidenceReviewCase = await db.verificationCase.create({
    data: {
      id: evidenceReviewCaseId,
      subjectType: 'CLINIC',
      clinicId: evidenceReviewClinic.id,
      submittedByUserId: input.submitterUserId,
      assignedReviewerUserId: input.administratorReviewerUserId,
      status: 'DRAFT',
      riskLevel: 'HIGH',
      methodologyVersion: '2026-01',
      version: 1,
    },
  });
  const secondApprovalCase = await db.verificationCase.create({
    data: {
      id: secondApprovalCaseId,
      subjectType: 'CLINIC',
      clinicId: secondApprovalClinic.id,
      submittedByUserId: input.submitterUserId,
      assignedReviewerUserId: input.primaryReviewerUserId,
      status: 'DRAFT',
      riskLevel: 'HIGH',
      methodologyVersion: '2026-01',
      version: 1,
    },
  });

  const templates = await db.verificationRequirementTemplate.findMany({
    where: { subjectType: 'CLINIC', active: true },
    orderBy: { code: 'asc' },
  });
  const pendingEvidenceSources: Readonly<Record<string, string>> = {
    'clinic.operating-license.v1': '/demo-evidence/clinic-operating-license.html',
    'clinic.infection-control.v1': '/demo-evidence/infection-control-process.html',
    'clinic.emergency.v1': '/demo-evidence/emergency-procedure.html',
  };

  for (const [index, template] of templates.entries()) {
    const pendingSource = pendingEvidenceSources[template.code];
    const evidenceReviewRequirement = await db.verificationRequirement.create({
      data: {
        verificationCaseId: evidenceReviewCase.id,
        templateId: template.id,
        status: pendingSource ? 'PROVIDED' : 'APPROVED',
        required: template.required,
        highRisk: template.highRisk,
      },
    });
    await db.verificationEvidence.create({
      data: {
        id: `d3000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
        verificationCaseId: evidenceReviewCase.id,
        requirementId: evidenceReviewRequirement.id,
        submittedByUserId: input.submitterUserId,
        ...(pendingSource ? {} : { approvedByUserId: input.administratorReviewerUserId }),
        category: template.category,
        sourceReference: pendingSource ?? `Development registry reference: ${template.code}`,
        issuedAt: new Date('2026-06-01T00:00:00Z'),
        expiresAt: new Date('2027-06-01T00:00:00Z'),
        ...(pendingSource ? {} : { approvedAt: new Date('2026-07-13T14:15:00Z') }),
      },
    });

    const secondApprovalRequirement = await db.verificationRequirement.create({
      data: {
        verificationCaseId: secondApprovalCase.id,
        templateId: template.id,
        status: 'APPROVED',
        required: template.required,
        highRisk: template.highRisk,
      },
    });
    await db.verificationEvidence.create({
      data: {
        id: `d3000000-0000-4000-8002-${String(index + 1).padStart(12, '0')}`,
        verificationCaseId: secondApprovalCase.id,
        requirementId: secondApprovalRequirement.id,
        submittedByUserId: input.submitterUserId,
        approvedByUserId: input.primaryReviewerUserId,
        category: template.category,
        sourceReference: `Development registry reference: ${template.code}`,
        issuedAt: new Date('2026-06-01T00:00:00Z'),
        expiresAt: new Date('2027-06-01T00:00:00Z'),
        approvedAt: new Date('2026-07-13T12:45:00Z'),
      },
    });
  }

  await db.verificationCase.update({
    where: { id: evidenceReviewCase.id },
    data: {
      status: 'SUBMITTED',
      version: 2,
      submittedAt: new Date('2026-07-13T14:05:00Z'),
    },
  });
  await db.verificationCase.update({
    where: { id: secondApprovalCase.id },
    data: {
      status: 'SUBMITTED',
      version: 2,
      submittedAt: new Date('2026-07-13T12:35:00Z'),
    },
  });

  for (const review of [
    {
      id: 'd4000000-0000-4000-8000-000000000001',
      caseVersion: 3,
      fromStatus: 'SUBMITTED' as const,
      toStatus: 'UNDER_REVIEW' as const,
      note: 'Development reviewer started the case review.',
    },
    {
      id: 'd4000000-0000-4000-8000-000000000002',
      caseVersion: 4,
      fromStatus: 'UNDER_REVIEW' as const,
      toStatus: 'APPROVED' as const,
      note: 'Development reviewer approved the complete checklist.',
    },
  ]) {
    await db.verificationReview.create({
      data: {
        id: review.id,
        verificationCaseId: secondApprovalCase.id,
        reviewerUserId: input.primaryReviewerUserId,
        caseVersion: review.caseVersion,
        fromStatus: review.fromStatus,
        toStatus: review.toStatus,
        status: 'APPLIED',
        fourEyesRequired: false,
        encryptedNotes: encryptDevelopmentValue(
          review.note,
          `verification-review:${review.id}:notes`,
        ),
        appliedAt: new Date('2026-07-13T12:45:00Z'),
      },
    });
    await db.verificationCase.update({
      where: { id: secondApprovalCase.id },
      data: { status: review.toStatus, version: review.caseVersion },
    });
  }
  const pendingReviewId = 'd4000000-0000-4000-8000-000000000003';
  await db.verificationReview.create({
    data: {
      id: pendingReviewId,
      verificationCaseId: secondApprovalCase.id,
      reviewerUserId: input.primaryReviewerUserId,
      caseVersion: 5,
      fromStatus: 'APPROVED',
      toStatus: 'VERIFIED',
      status: 'PENDING_SECOND_APPROVAL',
      fourEyesRequired: true,
      encryptedNotes: encryptDevelopmentValue(
        'Development reviewer proposed final verification after completing all evidence checks.',
        `verification-review:${pendingReviewId}:notes`,
      ),
    },
  });
}

async function applySeedVerificationReview(
  verificationCase: {
    readonly id: string;
    readonly status: VerificationStatus;
    readonly version: number;
  },
  toStatus: VerificationStatus,
  input: {
    readonly reviewerUserId: string;
    readonly secondApproverUserId: string;
  },
  fourEyesRequired: boolean,
) {
  const nextVersion = verificationCase.version + 1;
  const existing = await db.verificationReview.findUnique({
    where: {
      verificationCaseId_caseVersion: {
        verificationCaseId: verificationCase.id,
        caseVersion: nextVersion,
      },
    },
  });
  if (!existing) {
    const reviewId = randomUUID();
    await db.verificationReview.create({
      data: {
        id: reviewId,
        verificationCaseId: verificationCase.id,
        reviewerUserId: input.reviewerUserId,
        ...(fourEyesRequired ? { secondApproverUserId: input.secondApproverUserId } : {}),
        caseVersion: nextVersion,
        fromStatus: verificationCase.status,
        toStatus,
        status: 'APPLIED',
        fourEyesRequired,
        encryptedNotes: encryptDevelopmentValue(
          `Development review completed: ${verificationCase.status} to ${toStatus}.`,
          `verification-review:${reviewId}:notes`,
        ),
        ...(fourEyesRequired
          ? {
              encryptedSecondApprovalNotes: encryptDevelopmentValue(
                'Development second approval completed.',
                `verification-review:${reviewId}:second-approval`,
              ),
            }
          : {}),
        appliedAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
  }
  return db.verificationCase.update({
    where: { id: verificationCase.id },
    data: {
      status: toStatus,
      version: nextVersion,
      ...(toStatus === 'VERIFIED'
        ? {
            decidedAt: new Date('2026-06-01T00:00:00Z'),
            expiresAt: new Date('2027-06-01T00:00:00Z'),
          }
        : {}),
    },
  });
}

async function seedOperationalJourneys(input: {
  readonly adminUserId: string;
  readonly patientUserId: string;
  readonly patientProfileId: string;
  readonly clinicId: string;
  readonly dentistId: string;
  readonly dentistUserId: string;
  readonly primaryCaseId: string;
  readonly planVersionId: string;
  readonly planAcceptanceId: string;
  readonly patientSessionId: string;
  readonly treatmentConsentTextVersionId: string;
}): Promise<void> {
  const statusCases = [
    ['DT-DEV-DRAFT', 'DRAFT'],
    ['DT-DEV-INTAKE', 'INTAKE_REVIEW'],
    ['DT-DEV-MATCHING', 'MATCHING_IN_PROGRESS'],
    ['DT-DEV-BOOKED', 'BOOKED'],
    ['DT-DEV-TREATMENT', 'IN_TREATMENT'],
    ['DT-DEV-COMPLETED', 'TREATMENT_COMPLETED'],
    ['DT-DEV-AFTERCARE', 'AFTERCARE_ACTIVE'],
    ['DT-DEV-WARRANTY', 'WARRANTY_CASE_ACTIVE'],
    ['DT-DEV-CLOSED', 'CLOSED'],
  ] as const;
  const caseIds = new Map<string, string>();
  for (const [caseNumber, status] of statusCases) {
    const record = await db.dentalCase.upsert({
      where: { caseNumber },
      update: {},
      create: {
        caseNumber,
        patientProfileId: input.patientProfileId,
        title: `Development journey: ${status.toLowerCase().replaceAll('_', ' ')}`,
        desiredProcedureCode: 'DENTAL_IMPLANT',
        preferredLocation: 'Ho Chi Minh City',
        preferredCurrency: 'USD',
        status,
        statusHistory: {
          create: {
            toStatus: status,
            actorUserId: input.adminUserId,
            reason: 'Development seed state.',
            requestId: `seed-${caseNumber.toLowerCase()}`,
          },
        },
      },
    });
    caseIds.set(status, record.id);
  }

  await db.appointment.upsert({
    where: { id: '10000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '10000000-0000-4000-8000-000000000001',
      caseId: input.primaryCaseId,
      clinicId: input.clinicId,
      dentistId: input.dentistId,
      startsAt: new Date('2026-10-12T02:00:00Z'),
      endsAt: new Date('2026-10-12T03:00:00Z'),
      status: 'CONFIRMED',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const primaryBooking = await db.booking.upsert({
    where: { id: '20000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '20000000-0000-4000-8000-000000000001',
      caseId: input.primaryCaseId,
      treatmentPlanVersionId: input.planVersionId,
      treatmentPlanAcceptanceId: input.planAcceptanceId,
      planTotalMinor: BigInt(250_000),
      depositMinor: BigInt(50_000),
      depositBasisPoints: 2_000,
      currency: 'USD',
      cancellationPolicySnapshot: developmentCancellationPolicy(),
      invoice: {
        create: {
          id: '21000000-0000-4000-8000-000000000001',
          invoiceNumber: 'DTI-DEV-0001',
          amountMinor: BigInt(50_000),
          currency: 'USD',
        },
      },
    },
  });
  const primaryPayment = await db.payment.upsert({
    where: { bookingId: primaryBooking.id },
    update: {},
    create: {
      id: '22000000-0000-4000-8000-000000000001',
      bookingId: primaryBooking.id,
      provider: 'development',
      providerPaymentIntentId: 'dev_seed_primary_booking',
      idempotencyKey: 'seed-primary-booking-payment',
      amountMinor: BigInt(50_000),
      currency: 'USD',
      status: 'PROCESSING',
    },
  });
  if (primaryPayment.status === 'PROCESSING') {
    await db.payment.update({
      where: { id: primaryPayment.id },
      data: { status: 'SUCCEEDED', version: { increment: 1 } },
    });
  }

  const threadId = '30000000-0000-4000-8000-000000000000';
  const messageId = '30000000-0000-4000-8000-000000000001';
  const thread = await db.messageThread.upsert({
    where: { id: threadId },
    update: {
      subject: encryptDevelopmentValue(
        'Treatment plan questions',
        `message-thread:${threadId}:subject`,
      ),
    },
    create: {
      id: threadId,
      caseId: input.primaryCaseId,
      subject: encryptDevelopmentValue(
        'Treatment plan questions',
        `message-thread:${threadId}:subject`,
      ),
    },
  });
  await db.message.upsert({
    where: { id: messageId },
    update: {
      encryptedBody: encryptDevelopmentValue(
        'Could the dentist clarify the expected number of visits?',
        `message:${messageId}:body`,
      ),
    },
    create: {
      id: messageId,
      threadId: thread.id,
      authorUserId: input.patientUserId,
      encryptedBody: encryptDevelopmentValue(
        'Could the dentist clarify the expected number of visits?',
        `message:${messageId}:body`,
      ),
    },
  });

  const completedCaseId = requiredCaseId(caseIds, 'TREATMENT_COMPLETED');
  const completedPlan = await db.treatmentPlan.upsert({
    where: { caseId_clinicId: { caseId: completedCaseId, clinicId: input.clinicId } },
    update: {},
    create: { caseId: completedCaseId, clinicId: input.clinicId },
  });
  const completedPlanVersion = await db.treatmentPlanVersion.upsert({
    where: { treatmentPlanId_version: { treatmentPlanId: completedPlan.id, version: 1 } },
    update: {},
    create: {
      treatmentPlanId: completedPlan.id,
      version: 1,
      status: 'PUBLISHED',
      authoringDentistId: input.dentistId,
      preliminaryAssessment: 'Development completed-treatment assessment.',
      diagnosisStatement: 'Development record entered by a licensed clinician.',
      risks: 'Procedure-specific risks were reviewed with the patient.',
      limitations: 'Development fixture; not clinical advice.',
      warrantyTerms: 'Development warranty terms.',
      exclusions: 'Development exclusions.',
      currency: 'USD',
      totalMinor: BigInt(125_000),
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      publishedAt: new Date('2026-05-01T00:00:00Z'),
      contentChecksum: 'c'.repeat(64),
    },
  });
  const completedAcceptance = await db.treatmentPlanAcceptance.upsert({
    where: {
      treatmentPlanVersionId_userId: {
        treatmentPlanVersionId: completedPlanVersion.id,
        userId: input.patientUserId,
      },
    },
    update: {},
    create: {
      treatmentPlanVersionId: completedPlanVersion.id,
      userId: input.patientUserId,
      consentTextVersionId: input.treatmentConsentTextVersionId,
      sessionId: input.patientSessionId,
      requestId: 'seed-completed-plan-acceptance',
    },
  });
  const completedBooking = await db.booking.upsert({
    where: { id: '20000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '20000000-0000-4000-8000-000000000002',
      caseId: completedCaseId,
      treatmentPlanVersionId: completedPlanVersion.id,
      treatmentPlanAcceptanceId: completedAcceptance.id,
      planTotalMinor: BigInt(125_000),
      depositMinor: BigInt(25_000),
      depositBasisPoints: 2_000,
      currency: 'USD',
      cancellationPolicySnapshot: developmentCancellationPolicy(),
      invoice: {
        create: {
          id: '21000000-0000-4000-8000-000000000002',
          invoiceNumber: 'DTI-DEV-0002',
          amountMinor: BigInt(25_000),
          currency: 'USD',
        },
      },
    },
  });
  const completedPayment = await db.payment.upsert({
    where: { bookingId: completedBooking.id },
    update: {},
    create: {
      id: '22000000-0000-4000-8000-000000000002',
      bookingId: completedBooking.id,
      provider: 'development',
      providerPaymentIntentId: 'dev_seed_completed_booking',
      idempotencyKey: 'seed-completed-booking-payment',
      amountMinor: BigInt(25_000),
      currency: 'USD',
      status: 'PROCESSING',
    },
  });
  if (completedPayment.status === 'PROCESSING') {
    await db.payment.update({
      where: { id: completedPayment.id },
      data: { status: 'SUCCEEDED', version: { increment: 1 } },
    });
  }
  const confirmedCompletedBooking = await db.booking.findUniqueOrThrow({
    where: { id: completedBooking.id },
  });
  if (confirmedCompletedBooking.status === 'CONFIRMED') {
    await db.booking.update({
      where: { id: confirmedCompletedBooking.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date('2026-06-15T08:00:00Z'),
        version: { increment: 1 },
      },
    });
  }
  const passport = await db.dentalPassport.upsert({
    where: { caseId: completedCaseId },
    update: {},
    create: { caseId: completedCaseId },
  });
  const passportVersionId = '40000000-0000-4000-8000-000000000001';
  const treatmentSummary = 'Provider-recorded development treatment summary.';
  const dischargeInstructions =
    'Development discharge record; contact the treating clinic with questions.';
  const followUpInstructions = 'Attend the provider-scheduled follow-up appointment.';
  const implants = [
    {
      toothNumber: 11,
      system: 'Development implant system',
      manufacturer: 'Development manufacturer',
      dimensions: '4.0 × 10 mm',
      lotNumber: 'DEV-LOT-001',
    },
  ];
  const materials = [
    {
      procedureCode: 'DENTAL_IMPLANT',
      material: 'Titanium',
      manufacturer: 'Development manufacturer',
      lotNumber: 'DEV-LOT-001',
    },
  ];
  const prescriptions = [
    {
      medication: 'Provider-recorded development medication',
      dosage: 'As directed by the treating dentist',
      instructions: 'Development record; not medical advice.',
      prescribedAt: '2026-06-15',
    },
  ];
  const contentChecksum = createHash('sha256')
    .update(
      canonicalPassportContent({
        schemaVersion: 1,
        caseId: completedCaseId,
        clinicId: input.clinicId,
        treatingDentistId: input.dentistId,
        treatmentCompletedAt: '2026-06-15',
        treatmentSummary,
        dischargeInstructions,
        followUpInstructions,
        implants,
        materials,
        prescriptions,
      }),
    )
    .digest('hex');
  await db.dentalPassportVersion.upsert({
    where: { dentalPassportId_version: { dentalPassportId: passport.id, version: 1 } },
    update: {},
    create: {
      id: passportVersionId,
      dentalPassportId: passport.id,
      clinicId: input.clinicId,
      treatingDentistId: input.dentistId,
      authorUserId: input.dentistUserId,
      version: 1,
      status: 'DRAFT',
      treatmentCompletedAt: new Date('2026-06-15T00:00:00Z'),
      encryptedTreatmentSummary: encryptDevelopmentValue(
        treatmentSummary,
        `passport:${passportVersionId}:treatment-summary`,
      ),
      encryptedDischargeInstructions: encryptDevelopmentValue(
        dischargeInstructions,
        `passport:${passportVersionId}:discharge-instructions`,
      ),
      encryptedFollowUpInstructions: encryptDevelopmentValue(
        followUpInstructions,
        `passport:${passportVersionId}:follow-up-instructions`,
      ),
      contentChecksum,
      implants: {
        create: implants,
      },
      materials: {
        create: materials,
      },
      prescriptions: {
        create: prescriptions.map((prescription, index) => {
          const recordId = `40000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`;
          return {
            id: recordId,
            encryptedMedication: encryptDevelopmentValue(
              prescription.medication,
              `passport:${passportVersionId}:prescription:${recordId}:medication`,
            ),
            encryptedDosage: encryptDevelopmentValue(
              prescription.dosage,
              `passport:${passportVersionId}:prescription:${recordId}:dosage`,
            ),
            encryptedInstructions: encryptDevelopmentValue(
              prescription.instructions,
              `passport:${passportVersionId}:prescription:${recordId}:instructions`,
            ),
            prescribedAt: new Date(`${prescription.prescribedAt}T00:00:00Z`),
          };
        }),
      },
    },
  });

  const aftercareCaseId = requiredCaseId(caseIds, 'AFTERCARE_ACTIVE');
  const aftercarePlan =
    (await db.aftercarePlan.findFirst({ where: { caseId: aftercareCaseId } })) ??
    (await db.aftercarePlan.create({
      data: { caseId: aftercareCaseId, startsAt: new Date('2026-07-01T00:00:00Z') },
    }));
  const checkIn =
    (await db.aftercareCheckIn.findFirst({ where: { aftercarePlanId: aftercarePlan.id } })) ??
    (await db.aftercareCheckIn.create({
      data: {
        aftercarePlanId: aftercarePlan.id,
        painScale: 8,
        symptomCodes: ['SWELLING'],
        patientNotes: 'Development red-flag check-in requiring human review.',
      },
    }));
  const escalation = await db.aftercareEscalation.findFirst({
    where: { aftercareCheckInId: checkIn.id },
  });
  if (!escalation) {
    await db.aftercareEscalation.create({
      data: {
        aftercareCheckInId: checkIn.id,
        severity: 'URGENT',
        matchedRuleIds: ['pain-threshold', 'swelling'],
        status: 'OPEN',
        dueAt: new Date('2026-07-12T14:00:00Z'),
      },
    });
  }

  const review = await db.review.upsert({
    where: {
      caseId_patientUserId: { caseId: completedCaseId, patientUserId: input.patientUserId },
    },
    update: {},
    create: {
      caseId: completedCaseId,
      clinicId: input.clinicId,
      patientUserId: input.patientUserId,
      overallRating: 5,
      dimensionRatings: {
        communication: 5,
        transparency: 5,
        scheduling: 4,
        costAccuracy: 5,
        aftercare: 5,
      },
      content: 'The clinic communicated clearly and documented the treatment and aftercare plan.',
      treatmentDate: new Date('2026-06-15T00:00:00Z'),
      followUpDays: 30,
      verified: true,
      moderationStatus: 'PUBLISHED',
    },
  });
  await db.reviewFollowUp.upsert({
    where: { reviewId_followUpDays: { reviewId: review.id, followUpDays: 180 } },
    update: {},
    create: {
      reviewId: review.id,
      followUpDays: 180,
      content: 'Six-month development follow-up remained positive.',
      overallRating: 5,
      moderationStatus: 'PUBLISHED',
    },
  });

  const warrantyCaseId = completedCaseId;
  const seededIncidentId = randomUUID();
  const incident =
    (await db.incident.findFirst({ where: { caseId: warrantyCaseId } })) ??
    (await db.incident.create({
      data: {
        id: seededIncidentId,
        caseId: warrantyCaseId,
        clinicId: input.clinicId,
        createdByUserId: input.patientUserId,
        type: 'WARRANTY_CLAIM',
        severity: 'MEDIUM',
        status: 'IN_PROGRESS',
        summary: 'Development warranty review',
        encryptedDetails: encryptDevelopmentValue(
          'Patient reported a restoration concern for clinic review.',
          `incident:${seededIncidentId}:details`,
        ),
        slaDueAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    }));
  const incidentEvent = await db.incidentEvent.findFirst({ where: { incidentId: incident.id } });
  if (!incidentEvent) {
    await db.incidentEvent.create({
      data: {
        incidentId: incident.id,
        actorUserId: input.adminUserId,
        eventType: 'TRIAGED',
        visibility: 'PARTICIPANTS',
        details: { message: 'Clinic review assigned.' },
      },
    });
  }
  await db.warrantyClaim.upsert({
    where: { incidentId: incident.id },
    update: {},
    create: {
      incidentId: incident.id,
      clinicId: input.clinicId,
      status: 'UNDER_REVIEW',
      warrantyTerms: 'Development five-year implant warranty terms.',
    },
  });
}

function requiredCaseId(caseIds: ReadonlyMap<string, string>, status: string): string {
  const id = caseIds.get(status);
  if (!id) throw new Error(`Development case for ${status} was not created.`);
  return id;
}

async function seedConciergeMatching(input: {
  readonly patientUserId: string;
  readonly conciergeUserId: string;
  readonly supervisorUserId: string;
  readonly conciergeOrganizationId: string;
  readonly caseId: string;
  readonly clinics: readonly string[];
}): Promise<void> {
  const clinicIds = input.clinics.slice(0, 5);
  for (const [index, clinicId] of clinicIds.entries()) {
    const evidence = await db.verificationEvidence.findMany({
      where: {
        verificationCase: { clinicId, status: 'VERIFIED' },
        approvedAt: { not: null },
        revokedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { id: true },
    });
    await db.clinicDiscoveryProfile.upsert({
      where: { clinicId },
      update: {
        languages: index % 2 === 0 ? ['vi', 'en'] : ['vi'],
        equipment: ['CBCT', 'DIGITAL_SCANNER'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        supportedComplexities: ['STANDARD', 'COMPLEX'],
        aftercareSupported: true,
        followUpDataAvailable: index < 3,
        earliestConsultationAt: new Date(
          `2026-10-${String(11 + index).padStart(2, '0')}T02:00:00Z`,
        ),
        evidenceIds: evidence.map(({ id }) => id),
      },
      create: {
        clinicId,
        languages: index % 2 === 0 ? ['vi', 'en'] : ['vi'],
        equipment: ['CBCT', 'DIGITAL_SCANNER'],
        accessibilityFeatures: ['STEP_FREE_ACCESS'],
        supportedComplexities: ['STANDARD', 'COMPLEX'],
        aftercareSupported: true,
        followUpDataAvailable: index < 3,
        earliestConsultationAt: new Date(
          `2026-10-${String(11 + index).padStart(2, '0')}T02:00:00Z`,
        ),
        evidenceIds: evidence.map(({ id }) => id),
      },
    });
  }

  const organizationAssignment = await db.caseAssignment.findFirst({
    where: {
      caseId: input.caseId,
      kind: 'CONCIERGE',
      organizationId: input.conciergeOrganizationId,
      assignedUserId: null,
      endedAt: null,
    },
  });
  if (!organizationAssignment) {
    await db.caseAssignment.create({
      data: {
        caseId: input.caseId,
        kind: 'CONCIERGE',
        organizationId: input.conciergeOrganizationId,
      },
    });
  }
  const directAssignment = await db.caseAssignment.findFirst({
    where: {
      caseId: input.caseId,
      kind: 'CONCIERGE',
      organizationId: input.conciergeOrganizationId,
      assignedUserId: input.conciergeUserId,
      endedAt: null,
    },
  });
  if (!directAssignment) {
    await db.caseAssignment.create({
      data: {
        caseId: input.caseId,
        kind: 'CONCIERGE',
        organizationId: input.conciergeOrganizationId,
        assignedUserId: input.conciergeUserId,
      },
    });
  }

  const workspaceId = '42000000-0000-4000-8000-000000000001';
  await db.conciergeCaseWorkspace.upsert({
    where: { caseId: input.caseId },
    update: {},
    create: {
      id: workspaceId,
      caseId: input.caseId,
      conciergeOrganizationId: input.conciergeOrganizationId,
      assignedAgentUserId: input.conciergeUserId,
      supervisorUserId: input.supervisorUserId,
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      slaDueAt: new Date(Date.now() + 8 * 60 * 60_000),
      encryptedPatientSummary: encryptDevelopmentValue(
        'Patient is planning an October visit and needs evidence-backed implant options.',
        `concierge:case:${input.caseId}:summary`,
      ),
      missingDocumentCategories: ['CBCT'],
    },
  });

  const criteriaId = '40000000-0000-4000-8000-000000000001';
  const existingCriteria = await db.caseMatchingCriteria.findUnique({ where: { id: criteriaId } });
  if (!existingCriteria) {
    await db.caseMatchingCriteria.create({
      data: {
        id: criteriaId,
        caseId: input.caseId,
        version: 1,
        source: 'PATIENT',
        createdByUserId: input.patientUserId,
        procedureCode: 'DENTAL_IMPLANT',
        preferredCity: 'Ho Chi Minh City',
        arrivalDate: new Date('2026-10-10T00:00:00Z'),
        departureDate: new Date('2026-10-24T00:00:00Z'),
        preferredLanguages: ['en'],
        budgetMaximumMinor: BigInt(4_000),
        budgetCurrency: 'USD',
        complexityCategory: 'STANDARD',
        requiresAftercare: true,
        requiresWarranty: true,
        accessibilityNeeds: [],
        preferredEquipment: ['CBCT'],
        preferences: { travelFlexibility: 'moderate' },
        inputChecksum: 'e'.repeat(64),
      },
    });
  }

  for (const [index, clinicId] of clinicIds.slice(0, 3).entries()) {
    const resultId = `41000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const existingResult = await db.matchingResult.findUnique({ where: { id: resultId } });
    if (!existingResult) {
      await db.matchingResult.create({
        data: {
          id: resultId,
          caseId: input.caseId,
          clinicId,
          criteriaVersionId: criteriaId,
          organicRank: index + 1,
          fitScore: 91 - index * 7,
          reasons: ['VERIFIED_PROCEDURE_CAPABILITY', 'PREFERRED_CITY', 'AFTERCARE_SUPPORTED'],
          limitations: index === 2 ? ['PREFERRED_LANGUAGE_NOT_RECORDED'] : [],
          evidenceIds:
            (
              await db.clinicDiscoveryProfile.findUnique({
                where: { clinicId },
                select: { evidenceIds: true },
              })
            )?.evidenceIds ?? [],
          algorithmVersion: 'organic-v1',
        },
      });
    }
    const shortlistId = `43000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const existingShortlist = await db.caseShortlistEntry.findUnique({
      where: { id: shortlistId },
    });
    if (!existingShortlist) {
      await db.caseShortlistEntry.create({
        data: {
          id: shortlistId,
          caseId: input.caseId,
          clinicId,
          matchingResultId: resultId,
          organicRank: index + 1,
          displayedRank: index + 1,
          status: 'SHARED',
          sharedAt: new Date('2026-07-12T08:00:00Z'),
        },
      });
    }
  }

  if (clinicIds[0]) {
    await db.savedClinic.upsert({
      where: { userId_clinicId: { userId: input.patientUserId, clinicId: clinicIds[0] } },
      update: {},
      create: { userId: input.patientUserId, clinicId: clinicIds[0] },
    });
  }

  const noteId = '44000000-0000-4000-8000-000000000001';
  if (!(await db.conciergeInternalNote.findUnique({ where: { id: noteId } }))) {
    await db.conciergeInternalNote.create({
      data: {
        id: noteId,
        workspaceId,
        authorUserId: input.conciergeUserId,
        encryptedBody: encryptDevelopmentValue(
          'Internal development note. This content must never be patient-visible.',
          `concierge:internal-note:${noteId}:body`,
        ),
      },
    });
  }
  const taskId = '45000000-0000-4000-8000-000000000001';
  await db.conciergeTask.upsert({
    where: { id: taskId },
    update: {},
    create: {
      id: taskId,
      workspaceId,
      kind: 'MISSING_DOCUMENT',
      encryptedTitle: encryptDevelopmentValue(
        'Request current CBCT',
        `concierge:task:${taskId}:title`,
      ),
      assignedUserId: input.conciergeUserId,
      createdByUserId: input.conciergeUserId,
      dueAt: new Date(Date.now() + 4 * 60 * 60_000),
    },
  });
}

function developmentCancellationPolicy() {
  return {
    policyVersion: 1,
    cancellationCutoffMinutes: 1_440,
    termsVersion: '2026-07-12',
    source: 'CLINIC_POLICY',
    display: {
      'vi-VN': 'Yêu cầu hủy hoặc đổi lịch trước ít nhất 24 giờ.',
      'en-US': 'Request cancellation or rescheduling at least 24 hours in advance.',
    },
  };
}

async function seedBookingConfiguration(changedByUserId: string): Promise<void> {
  const configuration = await db.systemConfiguration.upsert({
    where: { key: 'booking.deposit-percent' },
    update: {},
    create: {
      key: 'booking.deposit-percent',
      description: 'Default booking deposit percentage.',
      valueType: 'INTEGER',
    },
  });
  await db.systemConfigurationVersion.upsert({
    where: { configurationId_version: { configurationId: configuration.id, version: 1 } },
    update: {},
    create: {
      configurationId: configuration.id,
      version: 1,
      value: '20',
      reason: 'Development checkout deposit fixture.',
      changedByUserId,
    },
  });
}

function encryptDevelopmentValue(value: string, context: string): string {
  const secret = process.env.FIELD_ENCRYPTION_KEY ?? 'development-only-field-key-change-me';
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

async function seedAuthorizationDefinitions(): Promise<Record<SystemRole, string>> {
  const roleIds = {} as Record<SystemRole, string>;
  for (const code of systemRoles) {
    const role = await db.roleDefinition.upsert({
      where: { code },
      update: {
        isPrivileged: [
          'CLINIC_ADMIN',
          'VERIFICATION_OFFICER',
          'FINANCE_ADMIN',
          'PLATFORM_ADMIN',
          'SUPER_ADMIN',
        ].includes(code),
      },
      create: {
        code,
        displayName: code.replaceAll('_', ' '),
        isPrivileged: [
          'CLINIC_ADMIN',
          'VERIFICATION_OFFICER',
          'FINANCE_ADMIN',
          'PLATFORM_ADMIN',
          'SUPER_ADMIN',
        ].includes(code),
      },
    });
    roleIds[code] = role.id;
  }
  const permissionIds = new Map<string, string>();
  for (const code of permissions) {
    const permission = await db.permissionDefinition.upsert({
      where: { code },
      update: {},
      create: { code, description: `Authorizes ${code}.` },
    });
    permissionIds.set(code, permission.id);
  }
  for (const roleCode of systemRoles) {
    for (const permissionCode of rolePermissions[roleCode]) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) continue;
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleIds[roleCode], permissionId } },
        update: {},
        create: { roleId: roleIds[roleCode], permissionId },
      });
    }
  }
  return roleIds;
}

async function seedConsentTexts(): Promise<void> {
  for (const purpose of [
    'TERMS',
    'PRIVACY',
    'TREATMENT_PLAN_ACCEPTANCE',
    'CLINIC_INTRODUCTION',
    'INTAKE_HEALTH_INFORMATION',
    'INTAKE_MEDICAL_DISCLAIMER',
  ] as const) {
    for (const locale of ['vi-VN', 'en-US'] as const) {
      await db.consentTextVersion.upsert({
        where: { purpose_version_locale: { purpose, version: TERMS_VERSION, locale } },
        update: {},
        create: {
          purpose,
          version: TERMS_VERSION,
          locale,
          contentHash:
            purpose === 'TERMS'
              ? 'b'.repeat(64)
              : purpose === 'PRIVACY'
                ? 'c'.repeat(64)
                : purpose === 'TREATMENT_PLAN_ACCEPTANCE'
                  ? 'd'.repeat(64)
                  : purpose === 'CLINIC_INTRODUCTION'
                    ? 'f'.repeat(64)
                    : purpose === 'INTAKE_HEALTH_INFORMATION'
                      ? 'a'.repeat(64)
                      : 'e'.repeat(64),
          publishedAt: new Date('2026-07-12T00:00:00Z'),
        },
      });
    }
  }
}

async function seedPatientOnboarding(input: {
  readonly patientUserId: string;
  readonly patientProfileId: string;
  readonly caseId: string;
  readonly patientSessionId: string;
}): Promise<void> {
  await db.user.update({
    where: { id: input.patientUserId },
    data: { preferredLocale: 'en-US' },
  });
  await db.patientProfile.update({
    where: { id: input.patientProfileId },
    data: {
      preferredCurrency: 'USD',
      currentCountry: 'Australia',
      currentCity: 'Melbourne',
      timezone: 'Australia/Melbourne',
      encryptedIdentityData: encryptDevelopmentValue(
        JSON.stringify({
          fullName: 'Linh Nguyen',
          dateOfBirth: '1988-04-18',
          pronouns: 'she/her',
        }),
        `patient-profile:${input.patientProfileId}:identity`,
      ),
      encryptedContactData: encryptDevelopmentValue(
        JSON.stringify({ phoneE164: '+61412345678' }),
        `patient-profile:${input.patientProfileId}:contact`,
      ),
      encryptedPreferences: encryptDevelopmentValue(
        JSON.stringify({
          contactChannel: 'MESSAGE',
          travelCoordination: true,
          appointmentReminders: true,
        }),
        `patient-profile:${input.patientProfileId}:preferences`,
      ),
      onboardingCompletedAt: new Date('2026-07-10T08:00:00Z'),
      version: 2,
    },
  });

  const emergencyContactId = '00000000-0000-4000-8000-000000000071';
  await db.emergencyContact.upsert({
    where: { id: emergencyContactId },
    update: {
      encryptedName: encryptDevelopmentValue(
        'Minh Nguyen',
        `emergency-contact:${emergencyContactId}:name`,
      ),
      encryptedPhone: encryptDevelopmentValue(
        '+61487654321',
        `emergency-contact:${emergencyContactId}:phone`,
      ),
      relationship: 'Partner',
    },
    create: {
      id: emergencyContactId,
      patientId: input.patientProfileId,
      encryptedName: encryptDevelopmentValue(
        'Minh Nguyen',
        `emergency-contact:${emergencyContactId}:name`,
      ),
      encryptedPhone: encryptDevelopmentValue(
        '+61487654321',
        `emergency-contact:${emergencyContactId}:phone`,
      ),
      relationship: 'Partner',
    },
  });

  const questionnaireId = '00000000-0000-4000-8000-000000000072';
  const questionnaire = await db.intakeQuestionnaire.upsert({
    where: { caseId: input.caseId },
    update: {},
    create: { id: questionnaireId, caseId: input.caseId },
  });
  const submittedVersionId = '00000000-0000-4000-8000-000000000073';
  let submitted = await db.intakeQuestionnaireVersion.upsert({
    where: { questionnaireId_version: { questionnaireId: questionnaire.id, version: 1 } },
    update: {},
    create: {
      id: submittedVersionId,
      questionnaireId: questionnaire.id,
      version: 1,
      ...seedIntakeScalars(submittedVersionId),
      currentStep: 6,
      draftRevision: 3,
    },
  });
  if (submitted.status === 'DRAFT') {
    await seedIntakeChildren(submitted.id, 'submitted');
    for (const [index, purpose] of [
      'INTAKE_HEALTH_INFORMATION',
      'INTAKE_MEDICAL_DISCLAIMER',
    ].entries()) {
      const text = await db.consentTextVersion.findUniqueOrThrow({
        where: {
          purpose_version_locale: { purpose, version: TERMS_VERSION, locale: 'en-US' },
        },
      });
      const consentRecordId = `00000000-0000-4000-8000-00000000008${index + 1}`;
      await db.consentRecord.upsert({
        where: { id: consentRecordId },
        update: {},
        create: {
          id: consentRecordId,
          userId: input.patientUserId,
          consentTextVersionId: text.id,
          requestId: `seed-intake-${purpose.toLowerCase()}`,
          sessionId: input.patientSessionId,
        },
      });
      await db.questionnaireConsent.upsert({
        where: {
          questionnaireVersionId_consentRecordId: {
            questionnaireVersionId: submitted.id,
            consentRecordId,
          },
        },
        update: {},
        create: { questionnaireVersionId: submitted.id, consentRecordId },
      });
    }
    submitted = await db.intakeQuestionnaireVersion.update({
      where: { id: submitted.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date('2026-07-10T08:30:00Z'),
        contentChecksum: createHash('sha256')
          .update('development-intake-submission-v1')
          .digest('hex'),
        draftRevision: { increment: 1 },
      },
    });
  }
  if (submitted.status === 'SUBMITTED') {
    await db.intakeQuestionnaireVersion.update({
      where: { id: submitted.id },
      data: { status: 'SUPERSEDED' },
    });
  }

  const draftVersionId = '00000000-0000-4000-8000-000000000074';
  let draft = await db.intakeQuestionnaireVersion.upsert({
    where: { questionnaireId_version: { questionnaireId: questionnaire.id, version: 2 } },
    update: {},
    create: {
      id: draftVersionId,
      questionnaireId: questionnaire.id,
      version: 2,
      ...seedIntakeScalars(draftVersionId),
      currentStep: 5,
      draftRevision: 4,
    },
  });
  if (draft.status === 'DRAFT') {
    draft = await db.intakeQuestionnaireVersion.update({
      where: { id: draft.id },
      data: { ...seedIntakeScalars(draftVersionId), currentStep: 5 },
    });
    await seedIntakeChildren(draft.id, 'draft');
  }
}

function seedIntakeScalars(versionId: string) {
  return {
    desiredProcedureCode: 'DENTAL_IMPLANT',
    dentalConcerns: ['MISSING_TOOTH', 'CHEWING_COMFORT'],
    treatmentGoals: ['RESTORE_FUNCTION', 'NATURAL_APPEARANCE'],
    encryptedExistingDiagnosis: encryptDevelopmentValue(
      'No formal diagnosis; seeking a licensed dentist assessment.',
      `intake-version:${versionId}:existing-diagnosis`,
    ),
    encryptedCosmeticExpectations: encryptDevelopmentValue(
      'A natural-looking restoration that matches nearby teeth.',
      `intake-version:${versionId}:cosmetic-expectations`,
    ),
    currentCountry: 'Australia',
    currentCity: 'Melbourne',
    expectedArrivalDate: new Date('2026-10-10T00:00:00Z'),
    expectedDepartureDate: new Date('2026-10-20T00:00:00Z'),
    preferredLocation: 'Ho Chi Minh City',
    availableTreatmentDays: 8,
    budgetMinimumMinor: BigInt(25_000_000),
    budgetMaximumMinor: BigInt(70_000_000),
    budgetCurrency: 'VND' as const,
    preferredLanguage: 'en',
    encryptedPriorDentalWork: encryptDevelopmentValue(
      'Crown placed on tooth 26 in 2021; no implant history.',
      `intake-version:${versionId}:prior-dental-work`,
    ),
    existingImplantSystems: [],
    smokingStatus: 'NEVER' as const,
    pregnancyStatus: 'NOT_PREGNANT' as const,
    accessibilityNeeds: [],
    preferredConsultationTimes: [
      { weekday: 2, start: '18:00', end: '20:00', timezone: 'Australia/Melbourne' },
    ],
  };
}

async function seedIntakeChildren(
  questionnaireVersionId: string,
  suffix: 'submitted' | 'draft',
): Promise<void> {
  const identifiers =
    suffix === 'submitted'
      ? {
          condition: '00000000-0000-4000-8000-000000000075',
          medication: '00000000-0000-4000-8000-000000000076',
          allergy: '00000000-0000-4000-8000-000000000077',
        }
      : {
          condition: '00000000-0000-4000-8000-000000000078',
          medication: '00000000-0000-4000-8000-000000000079',
          allergy: '00000000-0000-4000-8000-000000000080',
        };
  await db.intakeMedicalCondition.upsert({
    where: { id: identifiers.condition },
    update: {
      code: 'HYPERTENSION',
      encryptedDetails: encryptDevelopmentValue(
        'Controlled with medication.',
        `intake-condition:${identifiers.condition}:details`,
      ),
    },
    create: {
      id: identifiers.condition,
      questionnaireVersionId,
      code: 'HYPERTENSION',
      encryptedDetails: encryptDevelopmentValue(
        'Controlled with medication.',
        `intake-condition:${identifiers.condition}:details`,
      ),
    },
  });
  await db.intakeMedication.upsert({
    where: { id: identifiers.medication },
    update: {
      encryptedName: encryptDevelopmentValue(
        'Amlodipine',
        `intake-medication:${identifiers.medication}:name`,
      ),
      encryptedDosage: encryptDevelopmentValue(
        '5 mg daily',
        `intake-medication:${identifiers.medication}:dosage`,
      ),
    },
    create: {
      id: identifiers.medication,
      questionnaireVersionId,
      encryptedName: encryptDevelopmentValue(
        'Amlodipine',
        `intake-medication:${identifiers.medication}:name`,
      ),
      encryptedDosage: encryptDevelopmentValue(
        '5 mg daily',
        `intake-medication:${identifiers.medication}:dosage`,
      ),
    },
  });
  await db.intakeAllergy.upsert({
    where: { id: identifiers.allergy },
    update: {
      encryptedSubstance: encryptDevelopmentValue(
        'Penicillin',
        `intake-allergy:${identifiers.allergy}:substance`,
      ),
      encryptedReaction: encryptDevelopmentValue(
        'Rash',
        `intake-allergy:${identifiers.allergy}:reaction`,
      ),
    },
    create: {
      id: identifiers.allergy,
      questionnaireVersionId,
      encryptedSubstance: encryptDevelopmentValue(
        'Penicillin',
        `intake-allergy:${identifiers.allergy}:substance`,
      ),
      encryptedReaction: encryptDevelopmentValue(
        'Rash',
        `intake-allergy:${identifiers.allergy}:reaction`,
      ),
    },
  });
}

async function seedUserConsents(userId: string, locale: string): Promise<void> {
  for (const purpose of ['TERMS', 'PRIVACY'] as const) {
    const text = await db.consentTextVersion.findUniqueOrThrow({
      where: { purpose_version_locale: { purpose, version: TERMS_VERSION, locale } },
    });
    const existing = await db.consentRecord.findFirst({
      where: { userId, consentTextVersionId: text.id, withdrawnAt: null },
    });
    if (!existing) {
      await db.consentRecord.create({
        data: {
          userId,
          consentTextVersionId: text.id,
          requestId: `seed-consent-${purpose.toLowerCase()}`,
        },
      });
    }
  }
}

async function upsertUser(
  email: string,
  roles: readonly SystemRole[],
  roleIds: Record<SystemRole, string>,
  passwordHash: string,
  patientProfile = false,
) {
  return db.user.upsert({
    where: { email },
    update: { passwordHash, accountStatus: 'ACTIVE', emailVerifiedAt: new Date() },
    create: {
      email,
      passwordHash,
      accountStatus: 'ACTIVE',
      emailVerifiedAt: new Date(),
      roles: { create: roles.map((role) => ({ roleId: roleIds[role] })) },
      ...(patientProfile ? { patientProfile: { create: {} } } : {}),
    },
  });
}

async function upsertMembership(organizationId: string, userId: string, roleId: string) {
  return db.organizationMembership.upsert({
    where: { organizationId_userId_roleId: { organizationId, userId, roleId } },
    update: { status: 'ACTIVE', acceptedAt: new Date() },
    create: { organizationId, userId, roleId, status: 'ACTIVE', acceptedAt: new Date() },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unknown seed failure');
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
