import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commandErrorMessage,
  OperationsCommandError,
  sendOperationsCommand,
} from './operations-command';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('operations command client', () => {
  it('sends one same-origin JSON command with a unique idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { version: 3 } }));
    const randomUUID = vi.fn().mockReturnValue('11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID });

    await expect(
      sendOperationsCommand<{ readonly version: number }>({
        command: 'coordination_update',
        resourceId: '22222222-2222-4222-8222-222222222222',
        payload: { status: 'IN_PROGRESS', expectedVersion: 2 },
      }),
    ).resolves.toEqual({ version: 3 });

    expect(randomUUID).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/operations/commands');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      command: 'coordination_update',
      resourceId: '22222222-2222-4222-8222-222222222222',
      payload: { status: 'IN_PROGRESS', expectedVersion: 2 },
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('preserves a structured command error returned by the BFF', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'conflict' }, { status: 409 })),
    );

    await expect(
      sendOperationsCommand({
        command: 'verification_second_approve',
        resourceId: '22222222-2222-4222-8222-222222222222',
        payload: { expectedVersion: 2 },
      }),
    ).rejects.toEqual(
      expect.objectContaining({ name: 'OperationsCommandError', code: 'conflict' }),
    );
  });

  it('fails closed when a successful HTTP response has no data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));

    await expect(
      sendOperationsCommand({ command: 'admin_governance_mutate', payload: {} }),
    ).rejects.toEqual(
      expect.objectContaining({ name: 'OperationsCommandError', code: 'command_failed' }),
    );
  });

  it('reuses the idempotency key after an ambiguous dependency failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'service_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: { status: 'REQUESTED' } }));
    const randomUUID = vi.fn().mockReturnValue('33333333-3333-4333-8333-333333333333');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID });
    const command = {
      command: 'finance_refund' as const,
      resourceId: '22222222-2222-4222-8222-222222222222',
      payload: { amountMinor: 1000, reason: 'Duplicate-safe refund retry' },
    };

    await expect(sendOperationsCommand(command)).rejects.toEqual(
      expect.objectContaining({ code: 'service_unavailable' }),
    );
    await expect(sendOperationsCommand(command)).resolves.toEqual({ status: 'REQUESTED' });

    const keys = fetchMock.mock.calls.map(
      (call) => JSON.parse(String((call[1] as RequestInit).body)).idempotencyKey,
    );
    expect(keys).toEqual([
      '33333333-3333-4333-8333-333333333333',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it.each([
    ['mfa_required', 'Cần hoàn tất MFA trước thao tác đặc quyền này.'],
    ['forbidden', 'Tài khoản hiện tại không có quyền thực hiện thao tác.'],
    ['conflict', 'Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục.'],
    ['invalid_command_payload', 'Thông tin chưa hợp lệ hoặc thiếu lý do bắt buộc.'],
    ['AUTHORIZATION_DENIED', 'Tài khoản hiện tại không có quyền thực hiện thao tác.'],
    ['OPTIMISTIC_CONCURRENCY_FAILURE', 'Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục.'],
  ])('maps %s to an actionable operator message', (code, message) => {
    expect(commandErrorMessage(new OperationsCommandError(code))).toBe(message);
  });
});
