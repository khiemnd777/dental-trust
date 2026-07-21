import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AccountLifecycleRepository } from './account-lifecycle.repository.js';

describe('AccountLifecycleRepository password reset preflight', () => {
  it('accepts only a currently consumable reset token', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce({ id: 'token-1' }).mockResolvedValueOnce(null);
    const repository = new AccountLifecycleRepository({
      accountLifecycleToken: { findFirst },
    } as unknown as PrismaClient);

    await expect(repository.isPasswordResetConsumable('valid-hash')).resolves.toBe(true);
    await expect(repository.isPasswordResetConsumable('invalid-hash')).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: 'valid-hash',
        type: 'PASSWORD_RESET',
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        user: { accountStatus: 'ACTIVE', deletedAt: null },
      },
      select: { id: true },
    });
  });
});
