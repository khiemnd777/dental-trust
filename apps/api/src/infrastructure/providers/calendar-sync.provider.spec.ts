import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerEnvironment } from '@dental-trust/config/server';

import { createCalendarSyncProvider } from './calendar-sync.provider.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('calendar synchronization provider boundary', () => {
  it('prohibits the development adapter in production', () => {
    expect(() => createCalendarSyncProvider(environment({ NODE_ENV: 'production' }))).toThrow(
      'prohibited in production',
    );
  });

  it('requires both external endpoint and credential', () => {
    expect(() =>
      createCalendarSyncProvider(
        environment({ CALENDAR_ADAPTER: 'external', CALENDAR_PROVIDER_TOKEN: '' }),
      ),
    ).toThrow('configuration is missing');
  });

  it('uses an authenticated bounded external adapter and validates its response', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        status: 'ACTIVE',
        syncedAt: '2026-07-12T08:00:00.000Z',
        errorCode: null,
      }),
    );
    vi.stubGlobal('fetch', request);
    const provider = createCalendarSyncProvider(environment({ CALENDAR_ADAPTER: 'external' }));
    await expect(
      provider.connect({
        connectionId: 'connection-a',
        clinicId: 'clinic-a',
        provider: 'google',
        externalCalendarReference: 'clinic-calendar@example.com',
        idempotencyKey: 'operation-a',
      }),
    ).resolves.toEqual({
      status: 'ACTIVE',
      syncedAt: new Date('2026-07-12T08:00:00.000Z'),
      errorCode: null,
    });
    expect(request).toHaveBeenCalledWith(
      new URL('https://calendar.example.com/connections'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer calendar-token' }),
        body: expect.stringContaining('clinic-calendar@example.com'),
      }),
    );
  });

  it('returns unmistakable success only from the non-production development adapter', async () => {
    const provider = createCalendarSyncProvider(environment());
    const result = await provider.sync({ connectionId: 'connection-a', idempotencyKey: 'sync-a' });
    expect(result.status).toBe('ACTIVE');
    expect(result.syncedAt).toBeInstanceOf(Date);
  });
});

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    NODE_ENV: 'test',
    CALENDAR_ADAPTER: 'development',
    CALENDAR_PROVIDER_URL: 'https://calendar.example.com',
    CALENDAR_PROVIDER_TOKEN: 'calendar-token',
    ...overrides,
  } as ServerEnvironment;
}
