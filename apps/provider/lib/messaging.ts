import type { CaseDocumentView, MessageView } from '@dental-trust/contracts';

export const MAX_MESSAGE_ATTACHMENTS = 12;

export function unreadParticipantMessageIds(
  messages: readonly MessageView[],
  currentUserId: string,
): readonly string[] {
  return messages
    .filter((message) => message.authorUserId !== currentUserId && !message.readByCurrentUser)
    .map((message) => message.id);
}

export function isAttachableCaseDocument(document: CaseDocumentView): boolean {
  return document.status === 'AVAILABLE' && document.scanStatus === 'CLEAN';
}
