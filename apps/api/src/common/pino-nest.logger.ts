import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';

export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...optional: unknown[]): void {
    this.logger.info({ context: optional }, normalizeMessage(message));
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.logger.error({ context: optional }, normalizeMessage(message));
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.logger.warn({ context: optional }, normalizeMessage(message));
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.logger.debug({ context: optional }, normalizeMessage(message));
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.logger.trace({ context: optional }, normalizeMessage(message));
  }
}

function normalizeMessage(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}
