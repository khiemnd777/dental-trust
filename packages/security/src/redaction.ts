const sensitiveKeys = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'authorization',
  'cookie',
  'token',
  'tokenhash',
  'encryptedtoken',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'verificationtoken',
  'resettoken',
  'recoverycode',
  'signedurl',
  'presignedurl',
  'uploadurl',
  'downloadurl',
  'medicaldata',
  'encryptedmedicaldata',
  'healthcontext',
  'questionnaireresponses',
  'questionnaireanswers',
  'symptomcodes',
  'patientnotes',
  'recoverynotes',
  'diagnosisstatement',
  'prescriptions',
  'messagebody',
  'encryptedbody',
  'threadsubject',
  'encryptedsubject',
  'internalnote',
  'meetingjoinurl',
  'encryptedjoinurl',
  'cancellationreason',
  'encryptionkey',
  'totpsecret',
  'clientsecret',
  'stripesecretkey',
  'cardnumber',
  'cvc',
  'cvv',
  'paymentmethoddata',
  'rawpaymentdata',
  'billingdetails',
  'rawbody',
  'filecontents',
  'documentcontents',
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, '').toLowerCase();
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      sensitiveKeys.has(normalizeKey(key)) ? '[REDACTED]' : redactSensitive(nested),
    ]),
  );
}
