import type { AccessContext } from '@dental-trust/auth';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  accessContext?: AccessContext;
  requestId?: string;
}

export function requestIdOf(request: AuthenticatedRequest): string {
  return request.requestId ?? request.headers['x-request-id']?.toString() ?? 'request-unknown';
}
