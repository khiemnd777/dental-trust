import { describe, expect, it } from 'vitest';

import {
  appointmentAvailabilityQuerySchema,
  createAppointmentRequestSchema,
  createMessageThreadRequestSchema,
  sendMessageRequestSchema,
} from '@dental-trust/contracts';

const clinicId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e01';
const dentistId = '018f0c6a-7b2d-7d50-9a11-2f4b7c8d9e02';

describe('scheduling and messaging contracts', () => {
  it('requires explicit UTC instants, an IANA timezone, and a bounded positive window', () => {
    const valid = {
      clinicId,
      dentistId,
      startsAt: '2026-07-13T02:00:00.000Z',
      endsAt: '2026-07-13T03:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
    };
    expect(createAppointmentRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      createAppointmentRequestSchema.safeParse({
        ...valid,
        startsAt: '2026-07-13T09:00:00+07:00',
      }).success,
    ).toBe(false);
    expect(
      appointmentAvailabilityQuerySchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success,
    ).toBe(false);
    expect(
      createAppointmentRequestSchema.safeParse({
        ...valid,
        endsAt: '2026-07-13T01:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      createAppointmentRequestSchema.safeParse({
        ...valid,
        kind: 'CLINICAL_VISIT',
        meetingJoinUrl: 'https://meet.example.com/room',
      }).success,
    ).toBe(false);
  });

  it('bounds message content and rejects duplicate attachment IDs', () => {
    expect(
      createMessageThreadRequestSchema.safeParse({
        threadSubject: 'Treatment plan clarification',
        messageBody: 'Could you clarify the expected number of visits?',
        fileAssetIds: [clinicId, clinicId],
      }).success,
    ).toBe(false);
    expect(sendMessageRequestSchema.safeParse({ messageBody: ' ', fileAssetIds: [] }).success).toBe(
      false,
    );
  });
});
