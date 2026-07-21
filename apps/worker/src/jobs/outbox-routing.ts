import { queueNames } from './queues.js';

export interface OutboxJobData {
  readonly outboxEventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly correlationId: string;
}

export function outboxQueueName(eventType: string): (typeof queueNames)[keyof typeof queueNames] {
  if (eventType === 'file.scan-requested') return queueNames.fileProcessing;
  if (eventType === 'privacy-request.execution-requested') return queueNames.privacyExports;
  return queueNames.domainEvents;
}

export function outboxJobId(event: Pick<OutboxJobData, 'outboxEventId'>): string {
  return event.outboxEventId;
}
