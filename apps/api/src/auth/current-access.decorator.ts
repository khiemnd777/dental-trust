import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AccessContext } from '@dental-trust/auth';

import type { AuthenticatedRequest } from '../common/http.js';

export const CurrentAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.accessContext)
      throw new Error('Authentication guard did not attach an access context.');
    return request.accessContext;
  },
);
