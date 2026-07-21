import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import argon2 from 'argon2';

import type { ServerEnvironment } from '@dental-trust/config/server';

import {
  BoundedConcurrencyGate,
  ConcurrencyQueueFullError,
} from '../common/bounded-concurrency-gate.js';
import { SERVER_ENV } from '../common/tokens.js';

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;
const dummyPasswordHash =
  '$argon2id$v=19$m=65536,t=3,p=1$ZmFrZS1zYWx0LWZvci10aW1pbmc$2yP7NXMwLP9BUXvtVG5VTS6vZrd8S2Wkm+QhDPshGSc';

@Injectable()
export class PasswordHasher {
  private readonly gate: BoundedConcurrencyGate;

  constructor(@Inject(SERVER_ENV) environment: ServerEnvironment) {
    this.gate = new BoundedConcurrencyGate(
      environment.AUTH_HASH_CONCURRENCY,
      environment.AUTH_HASH_MAX_QUEUE,
    );
  }

  hash(password: string): Promise<string> {
    return this.withCapacity(() => argon2.hash(password, passwordHashOptions));
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return this.withCapacity(() => argon2.verify(passwordHash, password));
  }

  async constantTimeCheck(password: string): Promise<void> {
    await this.withCapacity(async () => {
      try {
        await argon2.verify(dummyPasswordHash, password);
      } catch {
        // The hash is intentionally fixed and no error details leave this boundary.
      }
    });
  }

  private async withCapacity<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await this.gate.run(operation);
    } catch (error) {
      if (error instanceof ConcurrencyQueueFullError) {
        throw new ServiceUnavailableException(
          'Authentication capacity is temporarily exhausted. Please retry shortly.',
        );
      }
      throw error;
    }
  }
}
