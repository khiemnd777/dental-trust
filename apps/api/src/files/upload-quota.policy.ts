const GIBIBYTE = 1024 * 1024 * 1024;

export interface UploadQuotaPolicy {
  readonly maxActiveUploadsPerUser: number;
  readonly maxBytesPerUserWindow: bigint;
  readonly windowSeconds: number;
  readonly activeQuarantineSeconds: number;
}

export interface UploadQuotaUsage {
  readonly activeUploads: number;
  readonly recentBytes: bigint;
  readonly requestedBytes: number;
}

export type UploadQuotaViolation = 'ACTIVE_UPLOADS' | 'RECENT_BYTES';

export function readUploadQuotaPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): UploadQuotaPolicy {
  return {
    maxActiveUploadsPerUser: readPositiveSafeInteger(
      environment.UPLOAD_MAX_ACTIVE_PER_USER,
      5,
      'UPLOAD_MAX_ACTIVE_PER_USER',
    ),
    maxBytesPerUserWindow: BigInt(
      readPositiveSafeInteger(
        environment.UPLOAD_MAX_BYTES_PER_USER_WINDOW,
        5 * GIBIBYTE,
        'UPLOAD_MAX_BYTES_PER_USER_WINDOW',
      ),
    ),
    windowSeconds: readPositiveSafeInteger(
      environment.UPLOAD_QUOTA_WINDOW_SECONDS,
      24 * 60 * 60,
      'UPLOAD_QUOTA_WINDOW_SECONDS',
    ),
    activeQuarantineSeconds: 15 * 60,
  };
}

export function uploadQuotaViolation(
  usage: UploadQuotaUsage,
  policy: UploadQuotaPolicy,
): UploadQuotaViolation | undefined {
  if (usage.activeUploads >= policy.maxActiveUploadsPerUser) return 'ACTIVE_UPLOADS';
  if (usage.recentBytes + BigInt(usage.requestedBytes) > policy.maxBytesPerUserWindow) {
    return 'RECENT_BYTES';
  }
  return undefined;
}

function readPositiveSafeInteger(
  rawValue: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (rawValue === undefined || rawValue.trim() === '') return defaultValue;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}
