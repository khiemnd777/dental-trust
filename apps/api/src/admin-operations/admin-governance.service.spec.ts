import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '@dental-trust/auth';
import {
  adminFeatureFlagVersionCommandSchema,
  adminGovernanceCommandEnvelopeSchema,
  adminLocationConfigurationCommandSchema,
  adminSystemConfigurationVersionCommandSchema,
  adminTaxonomyCommandSchema,
} from '@dental-trust/contracts';
import type { PrismaClient } from '@dental-trust/database';

import { AdminGovernanceService } from './admin-governance.service.js';

const administrator: AccessContext = {
  userId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01',
  sessionId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02',
  roles: ['PLATFORM_ADMIN'],
  memberships: [],
  mfaVerified: true,
  requestId: 'admin-governance-test',
};

describe('admin governance contracts', () => {
  it('accepts typed, confirmed commands and rejects secrets or malformed values', () => {
    expect(
      adminFeatureFlagVersionCommandSchema.parse({
        key: 'patient.passport-sharing',
        description: 'Controls secure patient Passport sharing.',
        expectedVersion: 2,
        enabled: true,
        environment: 'production',
        audiences: ['PATIENT'],
        reason: 'Approved release change ticket DT-1024.',
        confirmation: 'CHANGE FEATURE FLAG',
      }),
    ).toMatchObject({ expectedVersion: 2, enabled: true });
    expect(() =>
      adminSystemConfigurationVersionCommandSchema.parse({
        key: 'booking.deposit-percent',
        description: 'Default deposit percentage.',
        valueType: 'INTEGER',
        expectedVersion: 1,
        value: 'not-an-integer',
        reason: 'Approved finance policy change.',
        confirmation: 'CHANGE SYSTEM CONFIGURATION',
      }),
    ).toThrow();
    expect(() =>
      adminGovernanceCommandEnvelopeSchema.parse({
        view: 'feature-flags',
        command: { key: 'x', confirmation: 'YES' },
      }),
    ).toThrow();
  });

  it('requires bilingual taxonomy and valid country/locale configuration', () => {
    expect(
      adminTaxonomyCommandSchema.parse({
        kind: 'service_category',
        code: 'general-dentistry',
        names: { 'vi-VN': 'Nha khoa tổng quát', 'en-US': 'General dentistry' },
        active: true,
        parentId: null,
        expectedVersion: 0,
        reason: 'Initial approved service taxonomy.',
        confirmation: 'CHANGE TAXONOMY',
      }),
    ).toMatchObject({ kind: 'service_category' });
    expect(() =>
      adminLocationConfigurationCommandSchema.parse({
        kind: 'country',
        code: 'vietnam',
        names: { 'vi-VN': 'Việt Nam', 'en-US': 'Vietnam' },
        currency: 'VND',
        callingCode: '84',
        active: true,
        expectedVersion: 0,
        reason: 'Initial approved country configuration.',
        confirmation: 'CHANGE LOCATION CONFIGURATION',
      }),
    ).toThrow();
  });
});

describe('AdminGovernanceService authorization and reads', () => {
  it('allows content administrators only into content-governance views', async () => {
    const content = vi.fn().mockResolvedValue(emptyPage());
    const templates = vi.fn().mockResolvedValue(emptyPage());
    const featureFlags = vi.fn().mockResolvedValue(emptyPage());
    const service = serviceWith({ content, templates, featureFlags });
    const contentAdmin = { ...administrator, roles: ['CONTENT_ADMIN' as const] };
    await service.list(contentAdmin, 'content', { limit: 50 });
    await service.list(contentAdmin, 'templates', { limit: 50 });
    expect(content).toHaveBeenCalled();
    expect(templates).toHaveBeenCalled();
    expect(() => service.list(contentAdmin, 'feature-flags', { limit: 50 })).toThrow(
      ForbiddenException,
    );
  });

  it('rejects missing MFA and impersonation for all governance views', () => {
    const service = serviceWith({ content: vi.fn() });
    expect(() =>
      service.list({ ...administrator, mfaVerified: false }, 'content', { limit: 50 }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.list(
        {
          ...administrator,
          impersonation: {
            elevationId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e03',
            actorUserId: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e04',
            reason: 'Support investigation',
            expiresAt: new Date(Date.now() + 60_000),
            capabilities: [],
          },
        },
        'content',
        { limit: 50 },
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['content', 'content'],
    ['taxonomy', 'taxonomy'],
    ['templates', 'templates'],
    ['feature-flags', 'featureFlags'],
    ['configuration', 'configurations'],
    ['locations', 'locations'],
  ] as const)('delegates the %s list to %s', async (view, method) => {
    const repositoryMethod = vi.fn().mockResolvedValue(emptyPage());
    const service = serviceWith({ [method]: repositoryMethod });
    await service.list(administrator, view, { limit: 25 });
    expect(repositoryMethod).toHaveBeenCalledWith({ limit: 25 });
  });
});

describe('AdminGovernanceService mutations', () => {
  it.each([
    ['content', 'appendContent', contentCommand()],
    ['taxonomy', 'changeTaxonomy', taxonomyCommand()],
    ['templates', 'appendTemplate', templateCommand()],
    ['feature-flags', 'appendFeatureFlag', flagCommand()],
    ['configuration', 'appendConfiguration', configurationCommand()],
    ['locations', 'changeLocation', locationCommand()],
  ] as const)('records command evidence for %s through %s', async (view, method, command) => {
    const mutation = vi.fn().mockResolvedValue({ resourceId: administrator.userId, version: 1 });
    const service = serviceWith({ [method]: mutation });
    const result = await service.mutate(
      administrator,
      adminGovernanceCommandEnvelopeSchema.parse({ view, command }),
      '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99',
    );
    expect(result.version).toBe(1);
    expect(mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { userId: administrator.userId, requestId: administrator.requestId },
        command: expect.objectContaining({
          key: '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e99',
          requestHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
        reason: command.reason,
      }),
    );
  });
});

function contentCommand() {
  return {
    slug: 'patient-safety',
    locale: 'en-US',
    expectedVersion: 0,
    title: 'Patient safety commitments',
    summary: 'How the Dental Trust care model protects patients.',
    body: 'This durable page explains the controls patients can expect throughout care.',
    publicationStatus: 'DRAFT',
    reason: 'Initial approved patient-safety content.',
    confirmation: 'SAVE CONTENT VERSION',
  };
}
function taxonomyCommand() {
  return {
    kind: 'service_category',
    code: 'general-dentistry',
    names: { 'vi-VN': 'Nha khoa tổng quát', 'en-US': 'General dentistry' },
    active: true,
    parentId: null,
    expectedVersion: 0,
    reason: 'Initial approved service taxonomy.',
    confirmation: 'CHANGE TAXONOMY',
  };
}
function templateCommand() {
  return {
    key: 'case.updated',
    category: 'CASE_UPDATES',
    channel: 'EMAIL',
    locale: 'en-US',
    expectedVersion: 0,
    subject: 'Your Dental Trust case was updated',
    body: 'A new case update is waiting in your secure Dental Trust portal.',
    publicationStatus: 'PUBLISHED',
    reason: 'Approved transactional email copy.',
    confirmation: 'SAVE NOTIFICATION TEMPLATE',
  };
}
function flagCommand() {
  return {
    key: 'patient.passport-sharing',
    description: 'Controls secure patient Passport sharing.',
    expectedVersion: 0,
    enabled: true,
    environment: 'production',
    audiences: ['PATIENT'],
    reason: 'Approved release change ticket DT-1024.',
    confirmation: 'CHANGE FEATURE FLAG',
  };
}
function configurationCommand() {
  return {
    key: 'booking.deposit-percent',
    description: 'Default booking deposit percentage.',
    valueType: 'INTEGER',
    expectedVersion: 0,
    value: '20',
    reason: 'Approved finance policy DT-2026-04.',
    confirmation: 'CHANGE SYSTEM CONFIGURATION',
  };
}
function locationCommand() {
  return {
    kind: 'country',
    code: 'VN',
    names: { 'vi-VN': 'Việt Nam', 'en-US': 'Vietnam' },
    currency: 'VND',
    callingCode: '+84',
    active: true,
    expectedVersion: 0,
    reason: 'Initial approved country configuration.',
    confirmation: 'CHANGE LOCATION CONFIGURATION',
  };
}
function emptyPage() {
  return { records: [], nextCursor: null };
}
function serviceWith(repository: Record<string, unknown>) {
  const service = new AdminGovernanceService({} as PrismaClient);
  Object.defineProperty(service, 'governance', { value: repository });
  return service;
}
