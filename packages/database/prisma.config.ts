import { resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  try {
    process.loadEnvFile(
      process.env.DENTAL_TRUST_ENV_FILE ?? resolve(import.meta.dirname, '../../.env'),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      (error as Error & { readonly code?: string }).code !== 'ENOENT'
    ) {
      throw error;
    }
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx prisma/seed.ts',
  },
});
