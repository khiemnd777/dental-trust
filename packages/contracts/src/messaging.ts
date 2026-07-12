import { z } from 'zod';

const attachmentIdsSchema = z
  .array(z.uuid())
  .max(12)
  .default([])
  .refine((ids) => new Set(ids).size === ids.length, 'Attachment IDs must be unique.');

export const createMessageThreadRequestSchema = z.object({
  threadSubject: z.string().trim().min(1).max(160),
  messageBody: z.string().trim().min(1).max(8_000),
  fileAssetIds: attachmentIdsSchema,
});

export const sendMessageRequestSchema = z.object({
  messageBody: z.string().trim().min(1).max(8_000),
  fileAssetIds: attachmentIdsSchema,
});

export const markMessageReadRequestSchema = z.object({ messageId: z.uuid() });

export const createInternalNoteRequestSchema = z.object({
  internalNote: z.string().trim().min(1).max(8_000),
});

export const messageAttachmentViewSchema = z.object({
  fileAssetId: z.uuid(),
  originalFileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

export const messageViewSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  authorUserId: z.uuid(),
  messageBody: z.string(),
  readByCurrentUser: z.boolean(),
  attachments: z.array(messageAttachmentViewSchema),
  createdAt: z.string().datetime({ offset: true }),
  editedAt: z.string().datetime({ offset: true }).nullable(),
});

export const messageThreadViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  threadSubject: z.string(),
  closedAt: z.string().datetime({ offset: true }).nullable(),
  messageCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  lastMessageAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const internalNoteViewSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  authorUserId: z.uuid(),
  internalNote: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});

export type CreateMessageThreadRequest = z.infer<typeof createMessageThreadRequestSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type MarkMessageReadRequest = z.infer<typeof markMessageReadRequestSchema>;
export type CreateInternalNoteRequest = z.infer<typeof createInternalNoteRequestSchema>;
export type MessageAttachmentView = z.infer<typeof messageAttachmentViewSchema>;
export type MessageView = z.infer<typeof messageViewSchema>;
export type MessageThreadView = z.infer<typeof messageThreadViewSchema>;
export type InternalNoteView = z.infer<typeof internalNoteViewSchema>;
