export const queueNames = {
  domainEvents: 'domain-events',
  notifications: 'notifications',
  fileProcessing: 'file-processing',
  paymentFollowUp: 'payment-follow-up',
  passportGeneration: 'passport-generation',
  privacyExports: 'privacy-exports',
  verificationMaintenance: 'verification-maintenance',
  patientReminders: 'patient-reminders',
} as const;

export const defaultJobOptions = {
  attempts: 8,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
};

export const fileProcessingJobOptions = {
  ...defaultJobOptions,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 6 * 60 * 60, count: 2_000 },
  removeOnFail: { age: 3 * 24 * 60 * 60, count: 2_000 },
};
