import { describe, expect, it, vi } from 'vitest';

import type { DomainRuleError } from '@dental-trust/domain';

import { SchedulingMessagingRepository, type PrismaClient } from '../src/index.js';

const caseId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const userId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';
const threadId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03';
const messageId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04';
const fileAssetId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e05';

describe('SchedulingMessagingRepository message persistence', () => {
  it('stores only resource IDs in idempotency/audit/outbox metadata', async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    const outboxCreate = vi.fn().mockResolvedValue({});
    const idempotencyUpdate = vi.fn().mockResolvedValue({});
    const transaction = transactionMock({
      availableAttachmentCount: 1,
      auditCreate,
      outboxCreate,
      idempotencyUpdate,
    });
    const database = databaseMock(transaction);
    const repository = new SchedulingMessagingRepository(database as unknown as PrismaClient);

    await repository.createThread(
      caseId,
      {
        threadId,
        encryptedSubject: 'v1.subject-ciphertext',
        messageId,
        encryptedBody: 'v1.message-ciphertext',
        fileAssetIds: [fileAssetId],
      },
      actor(),
      command(),
    );

    const persistedMetadata = JSON.stringify([
      auditCreate.mock.calls,
      outboxCreate.mock.calls,
      idempotencyUpdate.mock.calls,
    ]);
    expect(persistedMetadata).not.toContain('patient plaintext');
    expect(idempotencyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ response: { resourceId: messageId } }),
      }),
    );
    expect(outboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            caseId,
            threadId,
            messageId,
            attachmentCount: 1,
          }),
        }),
      }),
    );
  });

  it('rejects an attachment unless it is CLEAN, AVAILABLE, and linked to the case', async () => {
    const transaction = transactionMock({ availableAttachmentCount: 0 });
    const database = databaseMock(transaction);
    const repository = new SchedulingMessagingRepository(database as unknown as PrismaClient);

    await expect(
      repository.createThread(
        caseId,
        {
          threadId,
          encryptedSubject: 'v1.subject-ciphertext',
          messageId,
          encryptedBody: 'v1.message-ciphertext',
          fileAssetIds: [fileAssetId],
        },
        actor(),
        command(),
      ),
    ).rejects.toMatchObject<Partial<DomainRuleError>>({ code: 'MESSAGE_ATTACHMENT_NOT_AVAILABLE' });
    expect(transaction.message.create).not.toHaveBeenCalled();
  });
});

function actor() {
  return {
    userId,
    sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e06',
    requestId: 'repository-test-request',
  };
}

function command() {
  return {
    key: 'message-idempotency-key-0001',
    operation: 'message-thread.create',
    requestHash: 'a'.repeat(64),
  };
}

function transactionMock(options: {
  readonly availableAttachmentCount: number;
  readonly auditCreate?: ReturnType<typeof vi.fn>;
  readonly outboxCreate?: ReturnType<typeof vi.fn>;
  readonly idempotencyUpdate?: ReturnType<typeof vi.fn>;
}) {
  return {
    idempotencyRecord: {
      create: vi.fn().mockResolvedValue({}),
      update: options.idempotencyUpdate ?? vi.fn().mockResolvedValue({}),
    },
    dentalCase: { findFirst: vi.fn().mockResolvedValue({ id: caseId }) },
    fileAsset: { count: vi.fn().mockResolvedValue(options.availableAttachmentCount) },
    messageThread: { create: vi.fn().mockResolvedValue({ id: threadId }) },
    message: { create: vi.fn().mockResolvedValue({ id: messageId }) },
    auditLog: { create: options.auditCreate ?? vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: options.outboxCreate ?? vi.fn().mockResolvedValue({}) },
  };
}

function databaseMock(transaction: ReturnType<typeof transactionMock>) {
  return {
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<string>) =>
      operation(transaction),
    ),
    messageThread: { findFirst: vi.fn().mockResolvedValue({ id: threadId }) },
    message: {
      findFirst: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        authorUserId: userId,
        encryptedBody: 'v1.message-ciphertext',
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        editedAt: null,
        attachments: [],
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: messageId,
          threadId,
          authorUserId: userId,
          encryptedBody: 'v1.message-ciphertext',
          createdAt: new Date('2026-07-12T00:00:00.000Z'),
          editedAt: null,
          attachments: [],
        },
      ]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}
