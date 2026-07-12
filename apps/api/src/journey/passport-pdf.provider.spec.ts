import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { renderBuiltInPassport, type PassportPdfInput } from './passport-pdf.provider.js';

const fixture: PassportPdfInput = {
  caseNumber: 'DT-2026-PDF01',
  version: 2,
  schemaVersion: 1,
  clinicName: 'Phòng khám Nha khoa Sài Gòn',
  dentistName: 'Bác sĩ Nguyễn Minh',
  treatmentCompletedAt: '2026-07-12',
  treatmentSummary: 'Nhà cung cấp ghi nhận phục hình răng theo hồ sơ điều trị.',
  dischargeInstructions: 'Giữ vệ sinh theo hướng dẫn của nha sĩ điều trị.',
  followUpInstructions: 'Tái khám theo lịch đã được phòng khám xác nhận.',
  implants: [
    {
      toothNumber: 11,
      system: 'Provider supplied system',
      manufacturer: 'Provider supplied manufacturer',
      dimensions: '4.0 x 10 mm',
      lotNumber: 'LOT-001',
    },
  ],
  materials: [{ procedureCode: 'DENTAL_IMPLANT', material: 'Titanium' }],
  prescriptions: [],
  contentChecksum: 'a'.repeat(64),
  previousVersionChecksum: 'b'.repeat(64),
  generatedAt: '2026-07-12T08:00:00.000Z',
};

describe('Dental Passport PDF renderer', () => {
  it('renders deterministic bounded PDF bytes with embedded Vietnamese glyph support', async () => {
    const first = await renderBuiltInPassport(fixture);
    const second = await renderBuiltInPassport(fixture);
    expect(first.subarray(0, 5).toString()).toBe('%PDF-');
    expect(first.length).toBeGreaterThan(5_000);
    expect(first.toString('latin1').match(/\/Type \/Page\b/gu)).toHaveLength(1);
    expect(createHash('sha256').update(first).digest('hex')).toBe(
      createHash('sha256').update(second).digest('hex'),
    );
  });
});
