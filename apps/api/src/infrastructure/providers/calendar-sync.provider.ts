import type { ServerEnvironment } from '@dental-trust/config/server';

export interface CalendarConnectionCommand {
  readonly connectionId: string;
  readonly clinicId: string;
  readonly dentistId?: string;
  readonly provider: string;
  readonly externalCalendarReference: string;
  readonly idempotencyKey: string;
}

export interface CalendarSyncCommand {
  readonly connectionId: string;
  readonly idempotencyKey: string;
}

export interface CalendarSyncResult {
  readonly status: 'ACTIVE' | 'ERROR';
  readonly syncedAt: Date | null;
  readonly errorCode: string | null;
}

export interface CalendarSyncProvider {
  connect(command: CalendarConnectionCommand): Promise<CalendarSyncResult>;
  sync(command: CalendarSyncCommand): Promise<CalendarSyncResult>;
  disconnect(command: CalendarSyncCommand): Promise<void>;
}

export function createCalendarSyncProvider(environment: ServerEnvironment): CalendarSyncProvider {
  if (environment.CALENDAR_ADAPTER === 'external') {
    if (!environment.CALENDAR_PROVIDER_URL || !environment.CALENDAR_PROVIDER_TOKEN) {
      throw new Error('External calendar synchronization configuration is missing.');
    }
    return new ExternalCalendarSyncProvider(
      environment.CALENDAR_PROVIDER_URL,
      environment.CALENDAR_PROVIDER_TOKEN,
    );
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error(
      'The development calendar synchronization adapter is prohibited in production.',
    );
  }
  return new DevelopmentCalendarSyncProvider();
}

class ExternalCalendarSyncProvider implements CalendarSyncProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async connect(command: CalendarConnectionCommand): Promise<CalendarSyncResult> {
    return this.request('connections', 'POST', {
      connectionId: command.connectionId,
      clinicId: command.clinicId,
      dentistId: command.dentistId,
      provider: command.provider,
      externalCalendarReference: command.externalCalendarReference,
      idempotencyKey: command.idempotencyKey,
    });
  }

  async sync(command: CalendarSyncCommand): Promise<CalendarSyncResult> {
    return this.request(`connections/${encodeURIComponent(command.connectionId)}/sync`, 'POST', {
      idempotencyKey: command.idempotencyKey,
    });
  }

  async disconnect(command: CalendarSyncCommand): Promise<void> {
    await this.request(`connections/${encodeURIComponent(command.connectionId)}`, 'DELETE', {
      idempotencyKey: command.idempotencyKey,
    });
  }

  private async request(
    path: string,
    method: 'POST' | 'DELETE',
    body: Record<string, unknown>,
  ): Promise<CalendarSyncResult> {
    const response = await fetch(new URL(path, `${this.baseUrl.replace(/\/$/u, '')}/`), {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok)
      throw new Error(`Calendar provider rejected the operation (${response.status}).`);
    if (method === 'DELETE') return { status: 'ACTIVE', syncedAt: null, errorCode: null };
    const result = (await response.json()) as {
      status?: unknown;
      syncedAt?: unknown;
      errorCode?: unknown;
    };
    if (result.status !== 'ACTIVE' && result.status !== 'ERROR') {
      throw new Error('Calendar provider returned an invalid status.');
    }
    const syncedAt =
      typeof result.syncedAt === 'string' && Number.isFinite(Date.parse(result.syncedAt))
        ? new Date(result.syncedAt)
        : null;
    const errorCode = typeof result.errorCode === 'string' ? result.errorCode.slice(0, 120) : null;
    if (result.status === 'ERROR' && !errorCode) {
      throw new Error('Calendar provider omitted its bounded error code.');
    }
    return { status: result.status, syncedAt, errorCode };
  }
}

class DevelopmentCalendarSyncProvider implements CalendarSyncProvider {
  async connect(): Promise<CalendarSyncResult> {
    return { status: 'ACTIVE', syncedAt: new Date(), errorCode: null };
  }

  async sync(): Promise<CalendarSyncResult> {
    return { status: 'ACTIVE', syncedAt: new Date(), errorCode: null };
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}
