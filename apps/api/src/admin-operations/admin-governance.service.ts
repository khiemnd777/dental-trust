import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AccessContext } from '@dental-trust/auth';
import type { AdminGovernanceCommandEnvelope, AdminGovernanceView } from '@dental-trust/contracts';
import {
  AdminGovernanceRepository,
  type GovernancePageInput,
  type PrismaClient,
} from '@dental-trust/database';

import { PRISMA } from '../common/tokens.js';
import { assertAdministrator, assertContentAdministrator } from './admin.policy.js';

@Injectable()
export class AdminGovernanceService {
  private readonly governance: AdminGovernanceRepository;

  constructor(@Inject(PRISMA) database: PrismaClient) {
    this.governance = new AdminGovernanceRepository(database);
  }

  list(access: AccessContext, view: AdminGovernanceView, query: GovernancePageInput) {
    assertViewAccess(access, view);
    if (view === 'content') return this.governance.content(query);
    if (view === 'taxonomy') return this.governance.taxonomy(query);
    if (view === 'templates') return this.governance.templates(query);
    if (view === 'feature-flags') return this.governance.featureFlags(query);
    if (view === 'configuration') return this.governance.configurations(query);
    return this.governance.locations(query);
  }

  mutate(access: AccessContext, envelope: AdminGovernanceCommandEnvelope, idempotencyKey: string) {
    assertViewAccess(access, envelope.view);
    const evidence = {
      actor: { userId: access.userId, requestId: access.requestId },
      command: {
        key: idempotencyKey,
        operation: `admin-governance:${envelope.view}`,
        requestHash: createHash('sha256').update(JSON.stringify(envelope)).digest('hex'),
      },
      reason: envelope.command.reason,
    };
    if (envelope.view === 'content')
      return this.governance.appendContent({ ...envelope.command, ...evidence });
    if (envelope.view === 'taxonomy')
      return this.governance.changeTaxonomy({ ...envelope.command, ...evidence });
    if (envelope.view === 'templates')
      return this.governance.appendTemplate({ ...envelope.command, ...evidence });
    if (envelope.view === 'feature-flags')
      return this.governance.appendFeatureFlag({ ...envelope.command, ...evidence });
    if (envelope.view === 'configuration')
      return this.governance.appendConfiguration({ ...envelope.command, ...evidence });
    return this.governance.changeLocation({ ...envelope.command, ...evidence });
  }
}

function assertViewAccess(access: AccessContext, view: AdminGovernanceView) {
  if (view === 'content' || view === 'taxonomy' || view === 'templates') {
    assertContentAdministrator(access);
    return;
  }
  assertAdministrator(access);
}
