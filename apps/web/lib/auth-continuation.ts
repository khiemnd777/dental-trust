import type { Locale } from '@dental-trust/i18n';

export type ProductTarget = 'care' | 'provider' | 'operations';

export interface AuthContinuation {
  readonly product?: ProductTarget;
  readonly returnTo?: string;
  readonly intent?: 'consultation';
  readonly clinic?: string;
  readonly dentist?: string;
}

type QueryValues = Readonly<Record<string, string | undefined>>;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function safeReturnTo(locale: Locale, value: unknown, fallback = ''): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith(`/${locale}/`) ||
    value.includes('//') ||
    value.includes('\\')
  )
    return fallback;
  return value;
}

export function authContinuationFromQuery(locale: Locale, values: QueryValues): AuthContinuation {
  return sanitizeAuthContinuation(locale, (key) => values[key]);
}

export function authContinuationFromForm(
  locale: Locale,
  formData: Pick<FormData, 'get'>,
): AuthContinuation {
  return sanitizeAuthContinuation(locale, (key) => formData.get(key));
}

export function authUrl(
  path: string,
  continuation: AuthContinuation,
  extra: Readonly<Record<string, string | undefined>> = {},
): string {
  const query = new URLSearchParams();
  if (continuation.product) query.set('product', continuation.product);
  if (continuation.returnTo) query.set('returnTo', continuation.returnTo);
  if (continuation.intent) query.set('intent', continuation.intent);
  if (continuation.clinic) query.set('clinic', continuation.clinic);
  if (continuation.dentist) query.set('dentist', continuation.dentist);
  for (const [key, value] of Object.entries(extra)) {
    if (value) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function careContinuationPath(continuation: AuthContinuation): string {
  if (continuation.intent !== 'consultation') return '';
  const query = new URLSearchParams();
  if (continuation.clinic) query.set('clinic', continuation.clinic);
  if (continuation.dentist) query.set('dentist', continuation.dentist);
  const serialized = query.toString();
  return `/start${serialized ? `?${serialized}` : ''}`;
}

function sanitizeAuthContinuation(
  locale: Locale,
  read: (key: keyof AuthContinuation) => unknown,
): AuthContinuation {
  const productValue = read('product');
  const product =
    productValue === 'care' || productValue === 'provider' || productValue === 'operations'
      ? productValue
      : undefined;
  const returnTo = safeReturnTo(locale, read('returnTo')) || undefined;
  const intent = read('intent') === 'consultation' ? 'consultation' : undefined;
  const clinic = safeSlug(read('clinic'));
  const dentist = safeSlug(read('dentist'));
  return {
    ...(product ? { product } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...(intent ? { intent } : {}),
    ...(clinic ? { clinic } : {}),
    ...(dentist ? { dentist } : {}),
  };
}

function safeSlug(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 120 && slugPattern.test(value)
    ? value
    : undefined;
}
