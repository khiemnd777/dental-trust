export interface AuditActor {
  readonly userId: string;
  readonly organizationId?: string;
  readonly sessionId: string;
  readonly impersonatorUserId?: string;
}

export interface AuditEventInput {
  readonly actor: AuditActor;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
  readonly success: boolean;
  readonly reason?: string;
  readonly before?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
}
