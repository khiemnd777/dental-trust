import type { PrismaClient } from '@dental-trust/database';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { parseServerEnvironment } from '@dental-trust/config/server';

import { AuthService } from './auth.service.js';
import type { PasswordHasher } from './password-hasher.js';

describe('AuthService password reset resource protection', () => {
  it('rejects an invalid reset token before starting Argon2', async () => {
    const passwordHasher = { hash: vi.fn() } as unknown as PasswordHasher;
    const service = new AuthService(
      {} as PrismaClient,
      parseServerEnvironment({ NODE_ENV: 'test' }),
      passwordHasher,
    );
    const lifecycle = {
      isPasswordResetConsumable: vi.fn().mockResolvedValue(false),
      consumePasswordReset: vi.fn(),
    };
    (service as unknown as { lifecycle: typeof lifecycle }).lifecycle = lifecycle;

    await expect(
      service.consumePasswordReset(
        { token: 'invalid-reset-token-value-with-enough-length', newPassword: 'new-password' },
        'request-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(lifecycle.consumePasswordReset).not.toHaveBeenCalled();
  });
});
