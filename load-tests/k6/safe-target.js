/* global __ENV */

const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const productionOverride = 'APPROVED_CHANGE_WINDOW';

export function safeTarget() {
  const rawTarget = (__ENV.TARGET_BASE_URL || '').trim();
  if (!rawTarget) throw new Error('TARGET_BASE_URL is required; no default target is allowed.');

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new Error('TARGET_BASE_URL must be an absolute http(s) URL.');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:')
    throw new Error('TARGET_BASE_URL must use http or https.');

  const environment = (__ENV.TARGET_ENV || '').trim().toLowerCase();
  const local = localHosts.has(target.hostname);
  if (!local) {
    const approvedOrigin = (__ENV.APPROVED_TARGET_ORIGIN || '').trim();
    if (approvedOrigin !== target.origin)
      throw new Error(
        'Remote runs require APPROVED_TARGET_ORIGIN to exactly match the target origin.',
      );
    if (!environment)
      throw new Error('Remote runs require TARGET_ENV=test, staging, or production.');
  }

  if (
    environment === 'production' &&
    (__ENV.ALLOW_PRODUCTION_LOAD_TESTS || '').trim() !== productionOverride
  )
    throw new Error(
      `Production is blocked by default; an approved change window must set ALLOW_PRODUCTION_LOAD_TESTS=${productionOverride}.`,
    );
  if (!local && environment !== 'test' && environment !== 'staging' && environment !== 'production')
    throw new Error('TARGET_ENV must be test, staging, or production for a remote target.');

  return target.origin;
}

export function boundedInteger(name, fallback, maximum) {
  const raw = (__ENV[name] || '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum)
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  return value;
}

export function boundedDuration(name, fallback) {
  const raw = (__ENV[name] || '').trim();
  if (!raw) return fallback;
  if (!/^([1-9]|[1-9]\d|[12]\d\d|300)s$/u.test(raw))
    throw new Error(`${name} must be a whole-second duration from 1s through 300s.`);
  return raw;
}

export function safeGetPaths() {
  const paths = (__ENV.PUBLIC_PATHS || '/')
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
  if (paths.length === 0 || paths.length > 10)
    throw new Error('PUBLIC_PATHS must contain 1-10 paths.');
  for (const path of paths) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..'))
      throw new Error(`Unsafe PUBLIC_PATHS entry: ${path}`);
  }
  return paths;
}

export function requiredInternalHealthToken() {
  const token = (__ENV.INTERNAL_HEALTH_TOKEN || '').trim();
  if (token.length < 32 || token.length > 512)
    throw new Error('INTERNAL_HEALTH_TOKEN must contain 32-512 characters.');
  return token;
}
