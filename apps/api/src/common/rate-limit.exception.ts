import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitExceededException extends HttpException {
  constructor(
    readonly errorCode: string,
    readonly retryAfterSeconds: number,
    readonly reason?: string,
  ) {
    super('Request rate limit exceeded.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
