import { describe, expect, it } from 'vitest';

import { parsePublicEnvironment } from '../src/public.js';

describe('public environment', () => {
  it('treats a blank optional Mapbox token as unconfigured', () => {
    const environment = parsePublicEnvironment({
      NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: '',
    });
    expect(environment.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN).toBeUndefined();
  });

  it('accepts an externalized Mapbox public browser token', () => {
    const environment = parsePublicEnvironment({
      NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: `pk.${'a'.repeat(40)}`,
    });
    expect(environment.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN).toMatch(/^pk\./u);
  });
});
