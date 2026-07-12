import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  authorizeCaseAction,
  type AccessContext,
  type CaseAccessResource,
} from '@dental-trust/auth';
import type {
  AftercareCheckInRequest,
  AftercarePlanView,
  CaregiverGrantRequest,
  CaregiverGrantView,
  CaseDocumentView,
  TreatmentPlanAcceptRequest,
  TreatmentPlanAcceptanceView,
  TreatmentPlanAuthoringContext,
  TreatmentPlanDraftRequest,
  TreatmentPlanPublishRequest,
  TreatmentPlanVersionView,
} from '@dental-trust/contracts';
import {
  ClinicalWorkflowRepository,
  type ClinicalActor,
  type PrismaClient,
} from '@dental-trust/database';
import { evaluateAftercareEscalation, type AftercareEscalationRule } from '@dental-trust/domain';
import { sha256 } from '@dental-trust/security';

import { PRISMA } from '../common/tokens.js';
import {
  assertAftercareReadAccess,
  assertPatientOwnerPermission,
  assertTreatmentPlanAuthorAccess,
  treatmentPlanVisibilityFor,
} from './clinical.policy.js';

const escalationRules: readonly AftercareEscalationRule[] = [
  {
    id: 'urgent-breathing-or-bleeding-v1',
    enabled: true,
    painThreshold: 9,
    symptomCodes: ['BREATHING_DIFFICULTY', 'UNCONTROLLED_BLEEDING'],
    severity: 'URGENT',
    emergencyGuidanceKey: 'aftercare.emergency.local-services',
  },
  {
    id: 'high-pain-fever-swelling-v1',
    enabled: true,
    painThreshold: 7,
    symptomCodes: ['FEVER', 'INCREASING_SWELLING'],
    severity: 'HIGH',
    emergencyGuidanceKey: 'aftercare.contact-clinic-now',
  },
  {
    id: 'routine-persistent-symptoms-v1',
    enabled: true,
    painThreshold: 5,
    symptomCodes: ['PERSISTENT_BAD_TASTE', 'SUTURE_CONCERN'],
    severity: 'ROUTINE',
    emergencyGuidanceKey: 'aftercare.request-clinical-review',
  },
];

@Injectable()
export class ClinicalService {
  private readonly workflows: ClinicalWorkflowRepository;

  constructor(@Inject(PRISMA) database: PrismaClient) {
    this.workflows = new ClinicalWorkflowRepository(database);
  }

  async listCaregivers(
    access: AccessContext,
    caseId: string,
  ): Promise<readonly CaregiverGrantView[]> {
    const resource = await this.resource(caseId);
    assertPatientOwnerPermission(access, resource, 'case:share');
    return this.workflows.listCaregiverGrants(caseId);
  }

  async inviteCaregiver(
    access: AccessContext,
    caseId: string,
    input: CaregiverGrantRequest,
    idempotencyKey: string,
  ): Promise<CaregiverGrantView> {
    const resource = await this.resource(caseId);
    assertPatientOwnerPermission(access, resource, 'case:share');
    return this.workflows.inviteCaregiver(
      caseId,
      {
        caregiverEmail: input.caregiverEmail,
        permissions: input.permissions,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
      actorFrom(access),
      command(access, idempotencyKey, 'caregiver.invite', { caseId, input }),
    );
  }

  async revokeCaregiver(
    access: AccessContext,
    caseId: string,
    grantId: string,
    idempotencyKey: string,
  ): Promise<CaregiverGrantView> {
    const resource = await this.resource(caseId);
    assertPatientOwnerPermission(access, resource, 'case:share');
    return this.workflows.revokeCaregiver(
      caseId,
      grantId,
      actorFrom(access),
      command(access, idempotencyKey, 'caregiver.revoke', { caseId, grantId }),
    );
  }

  async listTreatmentPlans(
    access: AccessContext,
    caseId: string,
  ): Promise<{
    readonly plans: readonly TreatmentPlanVersionView[];
    readonly authoringContext: TreatmentPlanAuthoringContext | null;
  }> {
    const resource = await this.resource(caseId);
    const visibility = treatmentPlanVisibilityFor(access, resource);
    const authoringRecord =
      visibility.includeDrafts && visibility.clinicOrganizationId
        ? await this.workflows.authoringContext(visibility.clinicOrganizationId, access.userId)
        : null;
    const authoringContext = authoringRecord
      ? {
          clinicId: authoringRecord.clinicId,
          clinicName: authoringRecord.clinicName,
          dentistOptions: authoringRecord.dentistOptions.map((dentist) => ({ ...dentist })),
        }
      : null;
    return {
      plans: await this.workflows.listTreatmentPlans(caseId, visibility),
      authoringContext,
    };
  }

  async getTreatmentPlan(
    access: AccessContext,
    caseId: string,
    versionId: string,
  ): Promise<TreatmentPlanVersionView> {
    const resource = await this.resource(caseId);
    const plan = await this.workflows.getTreatmentPlanVersion(
      caseId,
      versionId,
      treatmentPlanVisibilityFor(access, resource),
    );
    if (!plan) throw new NotFoundException();
    return plan;
  }

  async createTreatmentPlanDraft(
    access: AccessContext,
    caseId: string,
    input: TreatmentPlanDraftRequest,
    idempotencyKey: string,
  ): Promise<TreatmentPlanVersionView> {
    const resource = await this.resource(caseId);
    const organizationId = assertTreatmentPlanAuthorAccess(access, resource);
    return this.workflows.createTreatmentPlanDraft(
      caseId,
      {
        preliminaryAssessment: input.preliminaryAssessment,
        diagnosisStatement: input.diagnosisStatement,
        risks: input.risks,
        limitations: input.limitations,
        warrantyTerms: input.warrantyTerms,
        exclusions: input.exclusions,
        currency: input.currency,
        expiresAt: input.expiresAt,
        items: input.items.map((item) => ({
          procedureCode: item.procedureCode,
          toothNumbers: item.toothNumbers,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          ...(item.material ? { material: item.material } : {}),
          ...(item.brand ? { brand: item.brand } : {}),
        })),
        ...(input.authoringDentistId ? { authoringDentistId: input.authoringDentistId } : {}),
      },
      actorFrom(access, organizationId),
      command(access, idempotencyKey, 'treatment-plan.create-draft', { caseId, input }),
    );
  }

  async publishTreatmentPlan(
    access: AccessContext,
    caseId: string,
    versionId: string,
    input: TreatmentPlanPublishRequest,
    idempotencyKey: string,
  ): Promise<TreatmentPlanVersionView> {
    const resource = await this.resource(caseId);
    const organizationId = assertTreatmentPlanAuthorAccess(access, resource);
    return this.workflows.publishTreatmentPlanVersion(
      caseId,
      versionId,
      input.expectedVersion,
      input.contentChecksum,
      actorFrom(access, organizationId),
      command(access, idempotencyKey, 'treatment-plan.publish', {
        caseId,
        versionId,
        input,
      }),
    );
  }

  async acceptTreatmentPlan(
    access: AccessContext,
    caseId: string,
    versionId: string,
    input: TreatmentPlanAcceptRequest,
    idempotencyKey: string,
  ): Promise<TreatmentPlanAcceptanceView> {
    const resource = await this.resource(caseId);
    assertPatientOwnerPermission(access, resource, 'treatment-plan:accept');
    return this.workflows.acceptTreatmentPlanVersion(
      caseId,
      versionId,
      input.consentTextVersionId,
      actorFrom(access),
      command(access, idempotencyKey, 'treatment-plan.accept', {
        caseId,
        versionId,
        input,
      }),
    );
  }

  async listAftercare(
    access: AccessContext,
    caseId: string,
  ): Promise<readonly AftercarePlanView[]> {
    const resource = await this.resource(caseId);
    assertAftercareReadAccess(access, resource);
    return this.workflows.listAftercare(caseId);
  }

  async submitAftercareCheckIn(
    access: AccessContext,
    caseId: string,
    input: AftercareCheckInRequest,
    idempotencyKey: string,
  ): Promise<AftercarePlanView> {
    const resource = await this.resource(caseId);
    assertPatientOwnerPermission(access, resource, 'case:read:own');
    const decision = evaluateAftercareEscalation(input, escalationRules);
    const escalation =
      decision.escalate && decision.highestSeverity
        ? {
            matchedRuleIds: decision.matchedRuleIds,
            severity: decision.highestSeverity,
            dueAt: dueAtFor(decision.highestSeverity),
          }
        : null;
    return this.workflows.submitAftercareCheckIn(
      caseId,
      {
        aftercarePlanId: input.aftercarePlanId,
        painScale: input.painScale,
        symptomCodes: input.symptomCodes,
        photoFileAssetIds: input.photoFileAssetIds,
        ...(input.patientNotes ? { patientNotes: input.patientNotes } : {}),
      },
      escalation,
      actorFrom(access),
      command(access, idempotencyKey, 'aftercare.check-in', { caseId, input }),
    );
  }

  async listDocuments(access: AccessContext, caseId: string): Promise<readonly CaseDocumentView[]> {
    const resource = await this.resource(caseId);
    const decision = authorizeCaseAction(access, resource, 'READ_DOCUMENTS');
    if (!decision.allowed) throw new ForbiddenException();
    return this.workflows.listCaseDocuments(caseId);
  }

  private async resource(caseId: string): Promise<CaseAccessResource> {
    const resource = await this.workflows.loadCaseAccessResource(caseId);
    if (!resource) throw new NotFoundException();
    return resource;
  }
}

function actorFrom(
  access: AccessContext,
  organizationId = access.selectedOrganizationId,
): ClinicalActor {
  return {
    userId: access.userId,
    sessionId: access.sessionId,
    requestId: access.requestId,
    ...(organizationId ? { organizationId } : {}),
    ...(access.impersonation ? { impersonatorUserId: access.impersonation.actorUserId } : {}),
  };
}

function command(
  access: AccessContext,
  key: string,
  operation: string,
  request: Readonly<Record<string, unknown>>,
) {
  return {
    key,
    operation,
    requestHash: sha256(JSON.stringify(request)),
    userId: access.userId,
  };
}

function dueAtFor(severity: 'URGENT' | 'HIGH' | 'ROUTINE', now = new Date()): Date {
  const dueInMinutes = severity === 'URGENT' ? 15 : severity === 'HIGH' ? 60 : 24 * 60;
  return new Date(now.getTime() + dueInMinutes * 60_000);
}
