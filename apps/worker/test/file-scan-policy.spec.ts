import { describe, expect, it } from 'vitest';

import { isAllowedDetectedMediaType } from '../src/processors/file-scan.processor.js';

describe('file scan media policy', () => {
  it('keeps every advertised clinical upload format scan-eligible', () => {
    expect(
      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/dicom'].every(
        isAllowedDetectedMediaType,
      ),
    ).toBe(true);
  });

  it('rejects executable and unrecognized formats after malware scanning', () => {
    expect(isAllowedDetectedMediaType('application/x-msdownload')).toBe(false);
    expect(isAllowedDetectedMediaType('text/html')).toBe(false);
  });
});
