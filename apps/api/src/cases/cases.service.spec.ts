import type { PrismaClient } from '@dental-trust/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';

import { CasesService } from './cases.service.js';

const platformAccess: AccessContext = {
  userId: 'admin-user',
  sessionId: 'session-id',
  roles: ['PLATFORM_ADMIN'],
  memberships: [],
  mfaVerified: false,
  requestId: 'request-id',
};

describe('CasesService authorization boundary', () => {
  it('rejects an un-MFA platform administrator before enumerating cases', async () => {
    const service = new CasesService({} as PrismaClient);
    await expect(service.list(platformAccess, { limit: 25 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('conceals an out-of-scope case before loading unscoped policy data', async () => {
    const service = new CasesService({} as PrismaClient);
    const loadAccessResource = vi.fn();
    Object.defineProperty(service, 'cases', {
      value: { findScoped: vi.fn().mockResolvedValue(null), loadAccessResource },
    });
    const patient: AccessContext = {
      ...platformAccess,
      userId: 'patient-user',
      roles: ['PATIENT'],
    };
    await expect(
      service.get(patient, '00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(loadAccessResource).not.toHaveBeenCalled();
  });
});
