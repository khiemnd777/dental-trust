import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ServerEnvironment } from '@dental-trust/config/server';

import { CsrfProtectionMiddleware, NoStoreMiddleware } from './security.middleware.js';

describe('HTTP privacy and CSRF middleware', () => {
  it('marks authenticated-capable responses private and non-cacheable', () => {
    const setHeader = vi.fn();
    const next = vi.fn();
    new NoStoreMiddleware().use({} as never, { setHeader } as never, next);
    expect(setHeader).toHaveBeenCalledWith('cache-control', 'private, no-store, max-age=0');
    expect(setHeader).toHaveBeenCalledWith('pragma', 'no-cache');
    expect(next).toHaveBeenCalledOnce();
  });

  it('requires allowed origin and double-submit token for cookie-auth mutations', () => {
    const middleware = new CsrfProtectionMiddleware({
      CORS_ORIGINS: 'http://localhost:3000',
    } as ServerEnvironment);
    const next = vi.fn();
    middleware.use(
      {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'dt_session=session; dt_csrf=csrf-value',
          'x-csrf-token': 'csrf-value',
        },
      } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(() =>
      middleware.use(
        {
          method: 'POST',
          headers: {
            origin: 'https://attacker.example',
            cookie: 'dt_session=session; dt_csrf=csrf-value',
            'x-csrf-token': 'csrf-value',
          },
        } as never,
        {} as never,
        vi.fn(),
      ),
    ).toThrow(ForbiddenException);
  });
});
