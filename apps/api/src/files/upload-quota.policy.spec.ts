import { describe, expect, it } from 'vitest';

import { readUploadQuotaPolicy, uploadQuotaViolation } from './upload-quota.policy.js';

describe('upload quota policy', () => {
  const policy = {
    maxActiveUploadsPerUser: 2,
    maxBytesPerUserWindow: 1_000n,
    windowSeconds: 3_600,
    activeQuarantineSeconds: 900,
  };

  it('allows a request that stays below both active and recent-byte budgets', () => {
    expect(
      uploadQuotaViolation({ activeUploads: 1, recentBytes: 400n, requestedBytes: 600 }, policy),
    ).toBeUndefined();
  });

  it('rejects requests at the active upload ceiling', () => {
    expect(
      uploadQuotaViolation({ activeUploads: 2, recentBytes: 0n, requestedBytes: 1 }, policy),
    ).toBe('ACTIVE_UPLOADS');
  });

  it('rejects a request that would exceed the rolling byte budget', () => {
    expect(
      uploadQuotaViolation({ activeUploads: 0, recentBytes: 900n, requestedBytes: 101 }, policy),
    ).toBe('RECENT_BYTES');
  });

  it('validates environment overrides instead of silently accepting unsafe values', () => {
    expect(
      readUploadQuotaPolicy({
        UPLOAD_MAX_ACTIVE_PER_USER: '7',
        UPLOAD_MAX_BYTES_PER_USER_WINDOW: '2048',
        UPLOAD_QUOTA_WINDOW_SECONDS: '7200',
      }),
    ).toMatchObject({
      maxActiveUploadsPerUser: 7,
      maxBytesPerUserWindow: 2048n,
      windowSeconds: 7200,
    });
    expect(() => readUploadQuotaPolicy({ UPLOAD_MAX_ACTIVE_PER_USER: '0' })).toThrow(
      'UPLOAD_MAX_ACTIVE_PER_USER',
    );
  });
});
