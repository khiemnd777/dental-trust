import { describe, expect, it } from 'vitest';

import type { CaseDocumentView, MessageView } from '@dental-trust/contracts';
import { commandTarget } from '@/app/api/provider/commands/route';
import {
  isAttachableCaseDocument,
  MAX_MESSAGE_ATTACHMENTS,
  unreadParticipantMessageIds,
} from '@/lib/messaging';

const caseId = '00000000-0000-4000-8000-000000000001';
const threadId = '00000000-0000-4000-8000-000000000002';
const messageId = '00000000-0000-4000-8000-000000000003';
const currentUserId = '00000000-0000-4000-8000-000000000004';
const otherUserId = '00000000-0000-4000-8000-000000000005';
const idempotencyKey = '00000000-0000-4000-8000-000000000006';

function message(overrides: Partial<MessageView>): MessageView {
  return {
    id: messageId,
    threadId,
    authorUserId: otherUserId,
    messageBody: 'Cập nhật từ bệnh nhân',
    readByCurrentUser: false,
    attachments: [],
    createdAt: '2026-07-20T02:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}

function document(overrides: Partial<CaseDocumentView>): CaseDocumentView {
  return {
    id: '00000000-0000-4000-8000-000000000007',
    caseId,
    fileAssetId: '00000000-0000-4000-8000-000000000008',
    category: 'XRAY',
    description: null,
    originalFileName: 'x-quang.pdf',
    declaredMediaType: 'application/pdf',
    detectedMediaType: 'application/pdf',
    sizeBytes: 1024,
    status: 'AVAILABLE',
    scanStatus: 'CLEAN',
    createdAt: '2026-07-20T02:00:00.000Z',
    ...overrides,
  };
}

describe('Provider messaging presentation policy', () => {
  it('marks only unread messages authored by another participant', () => {
    const ids = unreadParticipantMessageIds(
      [
        message({ id: messageId }),
        message({ id: '00000000-0000-4000-8000-000000000009', readByCurrentUser: true }),
        message({ id: '00000000-0000-4000-8000-000000000010', authorUserId: currentUserId }),
      ],
      currentUserId,
    );

    expect(ids).toEqual([messageId]);
  });

  it('allows only clean, available case documents as attachments', () => {
    expect(isAttachableCaseDocument(document({}))).toBe(true);
    expect(isAttachableCaseDocument(document({ scanStatus: 'PENDING' }))).toBe(false);
    expect(isAttachableCaseDocument(document({ status: 'SCANNING' }))).toBe(false);
    expect(MAX_MESSAGE_ATTACHMENTS).toBe(12);
  });
});

describe('Provider messaging BFF targets', () => {
  it('maps read receipts and internal notes to their audience-specific API endpoints', () => {
    expect(
      commandTarget({
        command: 'mark_message_read',
        resourceId: caseId,
        secondaryId: threadId,
        payload: { messageId },
        idempotencyKey,
      }),
    ).toEqual({
      path: `cases/${caseId}/threads/${threadId}/messages/read`,
      payload: { messageId },
    });

    expect(
      commandTarget({
        command: 'create_internal_note',
        resourceId: caseId,
        secondaryId: threadId,
        payload: { internalNote: '  Chỉ đội ngũ phòng khám đọc.  ' },
        idempotencyKey,
      }),
    ).toEqual({
      path: `cases/${caseId}/threads/${threadId}/internal-notes`,
      payload: { internalNote: 'Chỉ đội ngũ phòng khám đọc.' },
    });
  });

  it('rejects invalid identifiers and empty internal notes before forwarding', () => {
    expect(() =>
      commandTarget({
        command: 'mark_message_read',
        resourceId: caseId,
        payload: { messageId },
        idempotencyKey,
      }),
    ).toThrow();
    expect(() =>
      commandTarget({
        command: 'create_internal_note',
        resourceId: caseId,
        secondaryId: threadId,
        payload: { internalNote: ' ' },
        idempotencyKey,
      }),
    ).toThrow();
  });
});
