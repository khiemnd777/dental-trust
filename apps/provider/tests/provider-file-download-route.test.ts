import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  providerApiForSession: vi.fn(),
  readProviderSession: vi.fn(),
}));

vi.mock('@/lib/require-session', () => ({
  readProviderSession: routeMocks.readProviderSession,
}));
vi.mock('@/lib/provider-api', () => ({
  ProviderApiError: class ProviderApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(code);
    }
  },
  providerApiForSession: routeMocks.providerApiForSession,
}));

import { GET, safeDownloadTarget } from '@/app/api/provider/files/[fileAssetId]/download/route';
import { ProviderApiError } from '@/lib/provider-api';

const fileAssetId = '00000000-0000-4000-8000-000000000001';
const caseId = '00000000-0000-4000-8000-000000000002';
const session = {
  token: 'provider-session-token',
  organizationId: '00000000-0000-4000-8000-000000000003',
  userId: '00000000-0000-4000-8000-000000000004',
  roles: ['DENTIST'],
  mfaVerified: true,
  mfaRequired: true,
};

function downloadRequest(query = '') {
  return new Request(
    `https://provider.example.test/api/provider/files/${fileAssetId}/download${query}`,
  );
}

function context(id = fileAssetId) {
  return { params: Promise.resolve({ fileAssetId: id }) };
}

function access(downloadUrl = 'https://objects.example.test/private/file.pdf?signature=signed') {
  return {
    fileAssetId,
    downloadUrl,
    expiresAt: '2026-07-20T06:00:00.000Z',
    mediaType: 'application/pdf',
  };
}

describe('Provider file download BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.readProviderSession.mockResolvedValue(session);
    routeMocks.providerApiForSession.mockResolvedValue(access());
  });

  it('requires a provider session before validating or forwarding the request', async () => {
    routeMocks.readProviderSession.mockResolvedValue(null);

    const response = await GET(downloadRequest('?caseId=invalid'), context('invalid'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(routeMocks.providerApiForSession).not.toHaveBeenCalled();
  });

  it('rejects invalid or ambiguous UUID inputs', async () => {
    const invalidAsset = await GET(downloadRequest(`?caseId=${caseId}`), context('invalid'));
    const invalidCase = await GET(downloadRequest('?caseId=invalid'), context());
    const duplicateCase = await GET(
      downloadRequest(`?caseId=${caseId}&caseId=${caseId}`),
      context(),
    );

    for (const response of [invalidAsset, invalidCase, duplicateCase]) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
    }
    expect(routeMocks.providerApiForSession).not.toHaveBeenCalled();
  });

  it('uses the tenant-scoped case download endpoint and redirects without the session token', async () => {
    const response = await GET(downloadRequest(`?caseId=${caseId}`), context());

    expect(routeMocks.providerApiForSession).toHaveBeenCalledWith(
      session,
      `files/${fileAssetId}/download?caseId=${caseId}`,
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://objects.example.test/private/file.pdf?signature=signed',
    );
    expect(response.headers.get('location')).not.toContain(session.token);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('supports organization-scoped clinic files when caseId is omitted', async () => {
    const response = await GET(downloadRequest(), context());

    expect(response.status).toBe(307);
    expect(routeMocks.providerApiForSession).toHaveBeenCalledWith(
      session,
      `files/clinic-uploads/${fileAssetId}/download`,
    );
  });

  it('rejects malformed, mismatched, and unsafe upstream responses', async () => {
    routeMocks.providerApiForSession
      .mockResolvedValueOnce({ ...access(), fileAssetId: caseId })
      .mockResolvedValueOnce({ ...access(), expiresAt: 'not-a-date' })
      .mockResolvedValueOnce(access('http://attacker.example.test/private/file.pdf'));

    const mismatched = await GET(downloadRequest(`?caseId=${caseId}`), context());
    const malformed = await GET(downloadRequest(`?caseId=${caseId}`), context());
    const unsafe = await GET(downloadRequest(`?caseId=${caseId}`), context());

    expect(mismatched.status).toBe(502);
    await expect(mismatched.json()).resolves.toEqual({ error: 'invalid_download_response' });
    expect(malformed.status).toBe(502);
    await expect(malformed.json()).resolves.toEqual({ error: 'invalid_download_response' });
    expect(unsafe.status).toBe(502);
    await expect(unsafe.json()).resolves.toEqual({ error: 'unsafe_download_url' });
  });

  it('preserves upstream errors and masks unexpected failures', async () => {
    routeMocks.providerApiForSession
      .mockRejectedValueOnce(new ProviderApiError(403, 'forbidden'))
      .mockRejectedValueOnce(new Error('provider token leaked'));

    const forbidden = await GET(downloadRequest(`?caseId=${caseId}`), context());
    const unavailable = await GET(downloadRequest(`?caseId=${caseId}`), context());

    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({ error: 'forbidden' });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: 'service_unavailable' });
  });
});

describe('safeDownloadTarget', () => {
  it.each([
    'https://objects.example.test/private/file.pdf?signature=signed',
    'http://localhost:9000/private/file.pdf?signature=signed',
    'http://127.0.0.1:9000/private/file.pdf?signature=signed',
    'http://[::1]:9000/private/file.pdf?signature=signed',
  ])('allows signed HTTPS and loopback object URLs: %s', (url) => {
    expect(safeDownloadTarget(url)?.toString()).toBe(url);
  });

  it.each([
    'http://objects.example.test/private/file.pdf',
    'javascript:alert(1)',
    'file:///tmp/private-file',
    'https://user:password@objects.example.test/private/file.pdf',
    'not-a-url',
  ])('rejects unsafe redirect targets: %s', (url) => {
    expect(safeDownloadTarget(url)).toBeNull();
  });
});
