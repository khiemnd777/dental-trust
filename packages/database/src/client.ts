import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { dentalTrustPrisma?: PrismaClient };

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });
}

export const prisma = globalForPrisma.dentalTrustPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.dentalTrustPrisma = prisma;
}
