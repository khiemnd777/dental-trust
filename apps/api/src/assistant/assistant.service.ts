import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { effectiveRoles, hasPermission, type AccessContext } from '@dental-trust/auth';
import type { ServerEnvironment } from '@dental-trust/config/server';
import {
  assistantModelOutputSchema,
  assistantNoticeVersion,
  type AssistantMessageRequest,
  type AssistantMessageView,
  type AssistantModelOutput,
} from '@dental-trust/contracts';
import {
  AssistantRepository,
  BookingRepository,
  CaseRepository,
  type AssistantMessage,
  type AssistantSession,
  type JourneySummaryRecord,
  type PrismaClient,
} from '@dental-trust/database';
import {
  assistantEmergencyReply,
  classifyAssistantSafety,
  normalizeAssistantAction,
  projectJourney,
  type AssistantJourneyContext,
  type AssistantSafetyLevel,
} from '@dental-trust/domain';
import { SensitiveFieldCipher, sha256 } from '@dental-trust/security';

import { ASSISTANT_MODEL_PROVIDER, PRISMA, SERVER_ENV } from '../common/tokens.js';
import type {
  AssistantHistoryItem,
  AssistantModelProvider,
} from '../infrastructure/providers/assistant-model.provider.js';

const promptVersion = 'care-guide-v1';
const emptyFields = {
  procedureCode: null,
  preferredLocation: null,
  timingPreference: null,
  decisionPriority: null,
} as const;

@Injectable()
export class AssistantService {
  private readonly repository: AssistantRepository;
  private readonly cases: CaseRepository;
  private readonly bookings: BookingRepository;
  private readonly cipher: SensitiveFieldCipher;

  constructor(
    @Inject(PRISMA) database: PrismaClient,
    @Inject(SERVER_ENV) environment: ServerEnvironment,
    @Inject(ASSISTANT_MODEL_PROVIDER) private readonly model: AssistantModelProvider,
  ) {
    this.repository = new AssistantRepository(database);
    this.cases = new CaseRepository(database);
    this.bookings = new BookingRepository(database);
    this.cipher = new SensitiveFieldCipher(environment.FIELD_ENCRYPTION_KEY);
  }

  async message(
    access: AccessContext,
    input: AssistantMessageRequest,
  ): Promise<AssistantMessageView> {
    this.assertAccess(access);
    const session = await this.resolveSession(access, input);
    const replay = await this.repository.findAssistantReplay(
      access.userId,
      session.id,
      input.clientMessageId,
    );
    if (replay) return this.decryptView(replay);

    const journey = await this.resolveJourney(access.userId, session.caseId);
    const context = await this.contextFor(access.userId, journey);
    const deterministicSafety = classifyAssistantSafety(input.message);
    const history = await this.history(access.userId, session.id);
    let modelResult: Awaited<ReturnType<AssistantModelProvider['respond']>> | undefined;
    let output: AssistantModelOutput;

    if (deterministicSafety === 'URGENT') {
      output = emergencyOutput(input.locale);
    } else {
      try {
        modelResult = await this.model.respond({
          locale: input.locale,
          message: input.message,
          history,
          context: {
            hasCase: context.hasCase,
            ...(journey ? { caseStatus: journey.status } : {}),
            ...(context.stage ? { stage: context.stage } : {}),
            hasAppointment: context.hasAppointment,
            hasCheckoutOption: context.hasCheckoutOption,
          },
          safetyIdentifier: sha256(access.userId),
        });
      } catch {
        throw new ServiceUnavailableException(
          'Trợ lý AI đang tạm thời không khả dụng. Bạn vẫn có thể nhắn điều phối viên.',
        );
      }
      output = this.enforcePolicy(modelResult.output, context, deterministicSafety, input.locale);
    }

    const assistantMessageId = randomUUID();
    const userMessageId = randomUUID();
    const view: AssistantMessageView = {
      ...output,
      sessionId: session.id,
      assistantMessageId,
      actionRequiresConfirmation: [
        'START_REQUEST',
        'REQUEST_CONSULTATION',
        'OPEN_BOOKING',
      ].includes(output.suggestedAction),
      createdAt: new Date().toISOString(),
    };
    await this.repository.appendExchange({
      sessionId: session.id,
      exchangeId: input.clientMessageId,
      userMessageId,
      assistantMessageId,
      encryptedUserContent: this.cipher.encrypt(
        input.message,
        assistantEncryptionContext(userMessageId),
      ),
      encryptedAssistantContent: this.cipher.encrypt(
        JSON.stringify(view),
        assistantEncryptionContext(assistantMessageId),
      ),
      safetyLevel: output.safetyLevel,
      suggestedAction: output.suggestedAction,
      ...(modelResult?.responseId ? { modelResponseId: modelResult.responseId } : {}),
      ...(modelResult?.inputTokens === undefined ? {} : { inputTokens: modelResult.inputTokens }),
      ...(modelResult?.outputTokens === undefined
        ? {}
        : { outputTokens: modelResult.outputTokens }),
      actorUserId: access.userId,
      requestId: access.requestId,
    });
    return view;
  }

  private assertAccess(access: AccessContext): void {
    if (
      access.impersonation ||
      !effectiveRoles(access).includes('PATIENT') ||
      !hasPermission(access, 'case:create')
    ) {
      throw new ForbiddenException();
    }
  }

  private async resolveSession(
    access: AccessContext,
    input: AssistantMessageRequest,
  ): Promise<AssistantSession> {
    if (input.sessionId) {
      const session = await this.repository.findOwnedSession(access.userId, input.sessionId);
      if (!session) throw new NotFoundException();
      if (input.caseId && session.caseId !== input.caseId) {
        throw new BadRequestException('The assistant session is bound to another case.');
      }
      return session;
    }
    if (input.caseId) await this.requireOwnedJourney(access.userId, input.caseId);
    return this.repository.createSession({
      id: randomUUID(),
      userId: access.userId,
      ...(input.caseId ? { caseId: input.caseId } : {}),
      locale: input.locale,
      model: this.model.model,
      promptVersion,
      noticeVersion: assistantNoticeVersion,
      requestId: access.requestId,
    });
  }

  private async resolveJourney(
    userId: string,
    caseId: string | null,
  ): Promise<JourneySummaryRecord | null> {
    if (caseId) return this.requireOwnedJourney(userId, caseId);
    const [latest] = await this.cases.listJourneySummaries(ownerScope(userId), 1);
    return latest?.patientProfile.userId === userId ? latest : null;
  }

  private async requireOwnedJourney(userId: string, caseId: string): Promise<JourneySummaryRecord> {
    const journey = await this.cases.findJourneySummary(ownerScope(userId), caseId);
    if (!journey || journey.patientProfile.userId !== userId) throw new NotFoundException();
    return journey;
  }

  private async contextFor(
    userId: string,
    journey: JourneySummaryRecord | null,
  ): Promise<AssistantJourneyContext> {
    const checkoutOptions = await this.bookings.checkoutOptions(userId);
    const projection = journey
      ? projectJourney({
          status: journey.status,
          perspective: 'PATIENT',
          hasOpenIncident: journey.incidents.length > 0,
        })
      : null;
    return {
      hasCase: Boolean(journey),
      ...(projection ? { stage: projection.stage } : {}),
      hasAppointment: (journey?.appointments.length ?? 0) > 0,
      hasCheckoutOption: journey
        ? checkoutOptions.some((option) => option.caseId === journey.id)
        : checkoutOptions.length > 0,
    };
  }

  private async history(
    userId: string,
    sessionId: string,
  ): Promise<readonly AssistantHistoryItem[]> {
    const messages = await this.repository.recentMessages(userId, sessionId, 8);
    return messages.reverse().map((message) => {
      const decrypted = this.cipher.decrypt(
        message.encryptedContent,
        assistantEncryptionContext(message.id),
      );
      if (message.role === 'USER') return { role: 'USER', content: decrypted };
      const parsed = assistantModelOutputSchema.safeParse(JSON.parse(decrypted));
      return {
        role: 'ASSISTANT',
        content: parsed.success ? parsed.data.reply : 'Previous assistant response unavailable.',
      };
    });
  }

  private decryptView(message: AssistantMessage): AssistantMessageView {
    const decrypted = this.cipher.decrypt(
      message.encryptedContent,
      assistantEncryptionContext(message.id),
    );
    return JSON.parse(decrypted) as AssistantMessageView;
  }

  private enforcePolicy(
    candidate: AssistantModelOutput,
    context: AssistantJourneyContext,
    deterministicSafety: AssistantSafetyLevel,
    locale: 'vi-VN' | 'en-US',
  ): AssistantModelOutput {
    const safetyLevel = higherSafety(candidate.safetyLevel, deterministicSafety);
    if (safetyLevel === 'URGENT') return emergencyOutput(locale);
    return {
      ...candidate,
      safetyLevel,
      suggestedAction: normalizeAssistantAction(candidate.suggestedAction, context, safetyLevel),
    };
  }
}

function ownerScope(userId: string) {
  return { userId, organizationIds: [], includeAll: false };
}

function assistantEncryptionContext(messageId: string): string {
  return `assistant-message:${messageId}`;
}

function higherSafety(
  left: AssistantSafetyLevel,
  right: AssistantSafetyLevel,
): AssistantSafetyLevel {
  const levels: readonly AssistantSafetyLevel[] = ['ROUTINE', 'ATTENTION', 'URGENT'];
  return levels[Math.max(levels.indexOf(left), levels.indexOf(right))] ?? 'ROUTINE';
}

function emergencyOutput(locale: 'vi-VN' | 'en-US'): AssistantModelOutput {
  return {
    reply: assistantEmergencyReply(locale),
    intent: 'HUMAN_SUPPORT',
    safetyLevel: 'URGENT',
    suggestedAction: 'EMERGENCY_CARE',
    collectedFields: emptyFields,
    missingFields: ['NONE'],
  };
}
