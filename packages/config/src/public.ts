import { z } from 'zod';

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:4000/api/v1'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['vi-VN', 'en-US']).default('vi-VN'),
  NEXT_PUBLIC_BUILD_VERSION: z.string().min(1).default('development'),
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .trim()
      .regex(/^pk\.[A-Za-z0-9._-]{20,}$/u, 'Mapbox browser token must start with pk.')
      .optional(),
  ),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(?:test|live)_[A-Za-z0-9_-]+$/u)
    .optional(),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  environment: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse(environment);
}
