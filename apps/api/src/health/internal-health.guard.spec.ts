import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { ServerEnvironment } from '@dental-trust/config/server';

import { InternalHealthGuard } from './internal-health.guard.js';

describe('InternalHealthGuard', () => {
  it('allows development without an internal token', () => {
    const guard = new InternalHealthGuard({ NODE_ENV: 'development' } as ServerEnvironment);
    expect(guard.canActivate(contextWithToken())).toBe(true);
  });

  it('requires the configured token without exposing the route', () => {
    const guard = new InternalHealthGuard({
      NODE_ENV: 'production',
      INTERNAL_HEALTH_TOKEN: 'h'.repeat(32),
    } as ServerEnvironment);
    expect(() => guard.canActivate(contextWithToken('wrong'))).toThrow(NotFoundException);
    expect(guard.canActivate(contextWithToken('h'.repeat(32)))).toBe(true);
  });
});

function contextWithToken(token?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { 'x-internal-health-token': token } : {},
      }),
    }),
  } as never;
}
