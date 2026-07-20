import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commandErrorMessage,
  ProviderCommandError,
  sendProviderCommand,
} from '@/lib/provider-command';

const idempotencyKey = '00000000-0000-4000-8000-000000000090';

describe('sendProviderCommand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a same-origin JSON command with a fresh idempotency key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { accepted: true } }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(idempotencyKey);

    await expect(
      sendProviderCommand<{ accepted: boolean }>({
        command: 'clinic_case_decision',
        resourceId: '00000000-0000-4000-8000-000000000001',
        payload: { expectedVersion: 1, decision: 'ACCEPT' },
      }),
    ).resolves.toEqual({ accepted: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/provider/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'clinic_case_decision',
        resourceId: '00000000-0000-4000-8000-000000000001',
        payload: { expectedVersion: 1, decision: 'ACCEPT' },
        idempotencyKey,
      }),
    });
  });

  it('surfaces a server error code and safely handles a non-JSON response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'mfa_required' }, { status: 403 }))
      .mockResolvedValueOnce(new Response('gateway unavailable', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(idempotencyKey);
    const input = {
      command: 'clinic_submit_onboarding' as const,
      payload: { expectedVersion: 1, attestation: 'A sufficiently long attestation.' },
    };

    await expect(sendProviderCommand(input)).rejects.toEqual(
      new ProviderCommandError('mfa_required'),
    );
    await expect(sendProviderCommand(input)).rejects.toEqual(
      new ProviderCommandError('command_result_unknown'),
    );
  });

  it('reuses the idempotency key after an unknown result and rotates it after success', async () => {
    const nextKey = '00000000-0000-4000-8000-000000000091';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'service_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: { accepted: true } }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ data: { accepted: true } }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(idempotencyKey)
      .mockReturnValueOnce(nextKey);
    const input = {
      command: 'create_message_thread' as const,
      resourceId: '00000000-0000-4000-8000-000000000001',
      payload: { threadSubject: 'Điều trị', messageBody: 'Xin chào', fileAssetIds: [] },
    };

    await expect(sendProviderCommand(input)).rejects.toEqual(
      new ProviderCommandError('command_result_unknown'),
    );
    await expect(sendProviderCommand(input)).resolves.toEqual({ accepted: true });
    await expect(sendProviderCommand(input)).resolves.toEqual({ accepted: true });

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((body) => body.idempotencyKey)).toEqual([
      idempotencyKey,
      idempotencyKey,
      nextKey,
    ]);
  });

  it('keeps an ambiguous retry key across reloads and tab restarts without storing command payloads', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size;
      },
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'service_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: { accepted: true } }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(idempotencyKey);
    const input = {
      command: 'create_internal_note' as const,
      resourceId: '00000000-0000-4000-8000-000000000001',
      payload: { body: 'Nội dung sức khỏe không được lưu vào localStorage.' },
    };

    vi.resetModules();
    const firstLoad = await import('@/lib/provider-command');
    await expect(firstLoad.sendProviderCommand(input)).rejects.toMatchObject({
      code: 'command_result_unknown',
    });
    expect([...values.keys()]).toHaveLength(1);
    expect(JSON.stringify([...values])).not.toContain('Nội dung sức khỏe');

    vi.resetModules();
    const secondLoad = await import('@/lib/provider-command');
    await expect(secondLoad.sendProviderCommand(input)).resolves.toEqual({ accepted: true });

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((body) => body.idempotencyKey)).toEqual([idempotencyKey, idempotencyKey]);
    expect(values.size).toBe(0);
  });

  it('prunes expired persisted retry entries from the 24-hour server retention window', async () => {
    const values = new Map<string, string>([
      [
        'provider-command-retry-v2:expired',
        JSON.stringify({ key: idempotencyKey, createdAt: Date.now() - 24 * 60 * 60_000 - 1 }),
      ],
    ]);
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size;
      },
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { accepted: true } }, { status: 200 })),
    );
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(idempotencyKey);

    await sendProviderCommand({
      command: 'clinic_sync_calendar',
      payload: { connectionId: '00000000-0000-4000-8000-000000000001' },
    });

    expect(values.has('provider-command-retry-v2:expired')).toBe(false);
  });
});

describe('commandErrorMessage', () => {
  it.each([
    ['mfa_required', 'Bạn cần hoàn tất MFA trước khi thực hiện thao tác này.'],
    ['MFA_REQUIRED', 'Bạn cần hoàn tất MFA trước khi thực hiện thao tác này.'],
    ['forbidden', 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'],
    ['AUTHORIZATION_DENIED', 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'],
    ['conflict', 'Dữ liệu đã thay đổi. Hãy tải lại và thử lại.'],
    ['OPTIMISTIC_CONCURRENCY_FAILURE', 'Dữ liệu đã thay đổi. Hãy tải lại và thử lại.'],
    ['invalid_command_payload', 'Một số thông tin chưa hợp lệ. Hãy kiểm tra lại.'],
    ['VALIDATION_ERROR', 'Một số thông tin chưa hợp lệ. Hãy kiểm tra lại.'],
    [
      'command_result_unknown',
      'Chưa xác nhận được kết quả. Khi thử lại, hệ thống sẽ dùng cùng mã thao tác để tránh tạo trùng.',
    ],
    ['unexpected', 'Không thể hoàn tất thao tác. Hãy kiểm tra dữ liệu mới nhất trước khi thử lại.'],
  ])('maps %s to a safe user-facing message', (code, message) => {
    expect(commandErrorMessage(new ProviderCommandError(code))).toBe(message);
  });

  it('does not expose details from an unknown thrown value', () => {
    expect(commandErrorMessage(new Error('database credentials leaked'))).toBe(
      'Không thể hoàn tất thao tác. Hãy kiểm tra dữ liệu mới nhất trước khi thử lại.',
    );
  });
});
