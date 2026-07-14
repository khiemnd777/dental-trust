import type { AssistantMessage, AssistantSession, PrismaClient } from '@prisma/client';

export interface CreateAssistantSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly caseId?: string;
  readonly locale: 'vi-VN' | 'en-US';
  readonly model: string;
  readonly promptVersion: string;
  readonly noticeVersion: string;
  readonly requestId: string;
}

export interface AppendAssistantExchangeInput {
  readonly sessionId: string;
  readonly exchangeId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
  readonly encryptedUserContent: string;
  readonly encryptedAssistantContent: string;
  readonly safetyLevel: 'ROUTINE' | 'ATTENTION' | 'URGENT';
  readonly suggestedAction: string;
  readonly modelResponseId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly actorUserId: string;
  readonly requestId: string;
}

export class AssistantRepository {
  constructor(private readonly db: PrismaClient) {}

  async createSession(input: CreateAssistantSessionInput): Promise<AssistantSession> {
    return this.db.$transaction(async (transaction) => {
      const session = await transaction.assistantSession.create({
        data: {
          id: input.id,
          userId: input.userId,
          ...(input.caseId ? { caseId: input.caseId } : {}),
          locale: input.locale,
          model: input.model,
          promptVersion: input.promptVersion,
          noticeVersion: input.noticeVersion,
          noticeAcknowledgedAt: new Date(),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: input.userId,
          action: 'assistant.session-created',
          resourceType: 'AssistantSession',
          resourceId: session.id,
          requestId: input.requestId,
          success: true,
          afterMetadata: {
            promptVersion: input.promptVersion,
            noticeVersion: input.noticeVersion,
            hasCase: Boolean(input.caseId),
          },
        },
      });
      return session;
    });
  }

  async findOwnedSession(userId: string, sessionId: string): Promise<AssistantSession | null> {
    return this.db.assistantSession.findFirst({
      where: { id: sessionId, userId, status: 'ACTIVE' },
    });
  }

  async findAssistantReplay(
    userId: string,
    sessionId: string,
    exchangeId: string,
  ): Promise<AssistantMessage | null> {
    return this.db.assistantMessage.findFirst({
      where: {
        sessionId,
        exchangeId,
        role: 'ASSISTANT',
        session: { userId },
      },
    });
  }

  async findOwnedAssistantMessage(
    userId: string,
    sessionId: string,
    messageId: string,
  ): Promise<AssistantMessage | null> {
    return this.db.assistantMessage.findFirst({
      where: {
        id: messageId,
        sessionId,
        role: 'ASSISTANT',
        session: { userId },
      },
    });
  }

  async recentMessages(userId: string, sessionId: string, limit: number) {
    return this.db.assistantMessage.findMany({
      where: { sessionId, session: { userId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, role: true, encryptedContent: true, createdAt: true },
    });
  }

  async appendExchange(input: AppendAssistantExchangeInput): Promise<AssistantMessage> {
    return this.db.$transaction(async (transaction) => {
      await transaction.assistantMessage.create({
        data: {
          id: input.userMessageId,
          sessionId: input.sessionId,
          exchangeId: input.exchangeId,
          role: 'USER',
          encryptedContent: input.encryptedUserContent,
        },
      });
      const assistantMessage = await transaction.assistantMessage.create({
        data: {
          id: input.assistantMessageId,
          sessionId: input.sessionId,
          exchangeId: input.exchangeId,
          role: 'ASSISTANT',
          encryptedContent: input.encryptedAssistantContent,
          safetyLevel: input.safetyLevel,
          suggestedAction: input.suggestedAction,
          ...(input.modelResponseId ? { modelResponseId: input.modelResponseId } : {}),
          ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
          ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
        },
      });
      await transaction.assistantSession.update({
        where: { id: input.sessionId },
        data: { updatedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: 'assistant.exchange-created',
          resourceType: 'AssistantSession',
          resourceId: input.sessionId,
          requestId: input.requestId,
          success: true,
          afterMetadata: {
            safetyLevel: input.safetyLevel,
            suggestedAction: input.suggestedAction,
            modelResponseId: input.modelResponseId ?? null,
          },
        },
      });
      return assistantMessage;
    });
  }
}
