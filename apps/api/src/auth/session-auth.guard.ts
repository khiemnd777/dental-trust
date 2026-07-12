import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import type { OrganizationMembershipClaim } from '@dental-trust/auth';
import type { SupportCapability, SystemRole } from '@dental-trust/domain';
import {
  IdentityRepository,
  type PrismaClient,
  type SystemRole as PrismaSystemRole,
  TrustSafetyRepository,
} from '@dental-trust/database';
import { sha256 } from '@dental-trust/security';

import type { AuthenticatedRequest } from '../common/http.js';
import { requestIdOf } from '../common/http.js';
import { PRISMA } from '../common/tokens.js';

const organizationRoles = new Set<PrismaSystemRole>([
  'DENTIST',
  'CLINIC_STAFF',
  'CLINIC_ADMIN',
  'CONCIERGE_AGENT',
]);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly identities: IdentityRepository;
  private readonly trust: TrustSafetyRepository;

  constructor(@Inject(PRISMA) db: PrismaClient) {
    this.identities = new IdentityRepository(db);
    this.trust = new TrustSafetyRepository(db);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = bearerToken(request) ?? cookieToken(request);
    if (!rawToken) throw new UnauthorizedException();

    const identity = await this.identities.findActiveSessionByHash(sha256(rawToken));
    if (!identity) throw new UnauthorizedException();

    const rawElevationId = request.headers['x-support-elevation-id']?.toString();
    let contextIdentity = identity;
    let impersonation:
      | {
          readonly elevationId: string;
          readonly actorUserId: string;
          readonly reason: string;
          readonly expiresAt: Date;
          readonly capabilities: readonly SupportCapability[];
        }
      | undefined;
    if (rawElevationId) {
      if (!uuidPattern.test(rawElevationId) || identity.mfaVerifiedAt === null) {
        throw new ForbiddenException();
      }
      const elevation = await this.trust.findActiveSupportElevation(
        rawElevationId,
        identity.userId,
      );
      if (
        !elevation ||
        elevation.subject.accountStatus !== 'ACTIVE' ||
        elevation.subject.deletedAt !== null ||
        !supportRouteAllowed(request, elevation.capabilities as readonly SupportCapability[])
      ) {
        throw new ForbiddenException();
      }
      await this.trust.recordSupportElevationUse({
        elevation,
        requestId: requestIdOf(request),
        requestPath: request.path,
      });
      contextIdentity = {
        ...identity,
        userId: elevation.subject.id,
        accountStatus: elevation.subject.accountStatus,
        roles: elevation.subject.roles.map(({ role }) => role.code),
        memberships: elevation.subject.memberships.map(({ organizationId, role }) => ({
          organizationId,
          role: role.code,
        })),
        mfaVerifiedAt: identity.mfaVerifiedAt,
      };
      impersonation = {
        elevationId: elevation.id,
        actorUserId: elevation.actorUserId,
        reason: elevation.reason,
        expiresAt: elevation.expiresAt,
        capabilities: elevation.capabilities as readonly SupportCapability[],
      };
    }

    const selectedOrganizationId = request.headers['x-organization-id']?.toString();
    const selectedMemberships = selectedOrganizationId
      ? contextIdentity.memberships.filter(
          (membership) => membership.organizationId === selectedOrganizationId,
        )
      : [];
    if (selectedOrganizationId && selectedMemberships.length === 0) {
      throw new ForbiddenException();
    }
    const mfaRequired =
      !impersonation && contextIdentity.mfaEnabled && identity.mfaVerifiedAt === null;
    if (mfaRequired && !isMfaBootstrapRequest(request)) throw new ForbiddenException();
    const availableMemberships = contextIdentity.memberships
      .filter(({ role }) => organizationRoles.has(role))
      .map(({ organizationId, role }) => ({
        organizationId,
        role: role as OrganizationMembershipClaim['role'],
      }));
    request.accessContext = {
      userId: contextIdentity.userId,
      sessionId: identity.sessionId,
      roles: contextIdentity.roles.filter(
        (role) => !organizationRoles.has(role),
      ) as readonly SystemRole[],
      memberships: selectedMemberships
        .filter(({ role }) => organizationRoles.has(role))
        .map(({ organizationId, role }) => ({
          organizationId,
          role: role as OrganizationMembershipClaim['role'],
        })),
      availableMemberships,
      mfaVerified: identity.mfaVerifiedAt !== null,
      mfaRequired,
      requestId: requestIdOf(request),
      ...(selectedOrganizationId ? { selectedOrganizationId } : {}),
      ...(impersonation ? { impersonation } : {}),
    };
    return true;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function supportRouteAllowed(
  request: AuthenticatedRequest,
  capabilities: readonly string[],
): boolean {
  const path = request.path.replace(/\/+$/u, '');
  const method = request.method.toUpperCase();
  if (method === 'GET' && path.endsWith('/auth/me')) return true;
  if (method === 'GET' && /\/cases\/[0-9a-f-]+$/iu.test(path)) {
    return capabilities.includes('CASE_READ');
  }
  if (method === 'GET' && /\/trust\/incidents(?:\/[0-9a-f-]+)?$/iu.test(path)) {
    return capabilities.includes('INCIDENT_READ');
  }
  if (method === 'POST' && /\/trust\/incidents\/[0-9a-f-]+\/updates$/iu.test(path)) {
    return capabilities.includes('INCIDENT_UPDATE');
  }
  if (method === 'GET' && /\/trust\/privacy\/requests(?:\/[0-9a-f-]+)?$/iu.test(path)) {
    return capabilities.includes('PRIVACY_STATUS_READ');
  }
  return false;
}

function isMfaBootstrapRequest(request: AuthenticatedRequest): boolean {
  const path = request.path.replace(/\/+$/u, '');
  return (
    (request.method === 'GET' && path.endsWith('/auth/me')) ||
    (request.method === 'POST' &&
      (path.endsWith('/auth/mfa/verify') || path.endsWith('/auth/logout')))
  );
}

function bearerToken(request: AuthenticatedRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

function cookieToken(request: AuthenticatedRequest): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'dt_session') return decodeURIComponent(value.join('='));
  }
  return undefined;
}
