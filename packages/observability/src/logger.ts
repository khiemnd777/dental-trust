import pino, { type Logger } from 'pino';

import { getRequestContext } from './request-context.js';

const sensitiveLogKeys = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'encryptedToken',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'verificationToken',
  'resetToken',
  'recoveryCode',
  'signedUrl',
  'uploadUrl',
  'downloadUrl',
  'medicalData',
  'encryptedMedicalData',
  'healthContext',
  'questionnaireResponses',
  'symptomCodes',
  'patientNotes',
  'messageBody',
  'encryptedBody',
  'threadSubject',
  'encryptedSubject',
  'internalNote',
  'meetingJoinUrl',
  'encryptedJoinUrl',
  'cancellationReason',
  'encryptionKey',
  'totpSecret',
  'clientSecret',
  'stripeSecretKey',
  'cardNumber',
  'cvc',
  'cvv',
  'paymentMethodData',
  'rawPaymentData',
  'billingDetails',
  'rawBody',
  'fileContents',
  'documentContents',
] as const;

const sensitiveLogKeyVariants = [
  ...new Set(
    sensitiveLogKeys.flatMap((key) => [
      key,
      key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`),
    ]),
  ),
];

const sensitiveLogPaths = sensitiveLogKeyVariants.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
  `*.*.*.${key}`,
]);

export function createLogger(options: {
  readonly service: string;
  readonly environment: string;
  readonly version?: string;
  readonly level?: string;
}): Logger {
  return pino({
    name: options.service,
    level: options.level ?? 'info',
    base: {
      service: options.service,
      environment: options.environment,
      version: options.version ?? 'development',
    },
    mixin: () => getRequestContext() ?? {},
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', ...sensitiveLogPaths],
      censor: '[REDACTED]',
    },
  });
}
