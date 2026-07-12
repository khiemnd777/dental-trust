import { describe, expect, it } from 'vitest';

import type { ServerEnvironment } from '@dental-trust/config/server';

import { createMeetingProvider } from './meeting.provider.js';

describe('meeting provider boundary', () => {
  it('prohibits a development meeting provider in production', () => {
    expect(() =>
      createMeetingProvider(
        environment({ NODE_ENV: 'production', MEETING_ADAPTER: 'development' }),
      ),
    ).toThrow('prohibited in production');
  });

  it('requires a manually provisioned URL on an explicit HTTPS host allowlist', async () => {
    const provider = createMeetingProvider(
      environment({
        NODE_ENV: 'production',
        MEETING_ADAPTER: 'manual',
        MEETING_ALLOWED_HOSTS: 'meet.example.com',
      }),
    );
    await expect(provider.resolveJoinLink({ appointmentId: 'appointment-a' })).rejects.toThrow(
      'required',
    );
    await expect(
      provider.resolveJoinLink({
        appointmentId: 'appointment-a',
        manualJoinUrl: 'https://evil.example.com/room',
      }),
    ).rejects.toThrow('approved HTTPS');
    await expect(
      provider.resolveJoinLink({
        appointmentId: 'appointment-a',
        manualJoinUrl: 'https://meet.example.com/room/abc',
      }),
    ).resolves.toEqual({ provider: 'manual', joinUrl: 'https://meet.example.com/room/abc' });
  });

  it('rejects URL-shaped or local allowlist entries at provider construction', () => {
    expect(() =>
      createMeetingProvider(
        environment({
          MEETING_ADAPTER: 'manual',
          MEETING_ALLOWED_HOSTS: 'https://meet.example.com',
        }),
      ),
    ).toThrow('bare public DNS');
    expect(() =>
      createMeetingProvider(
        environment({ MEETING_ADAPTER: 'manual', MEETING_ALLOWED_HOSTS: 'localhost' }),
      ),
    ).toThrow('bare public DNS');
  });

  it('uses an unmistakable local-only URL for the development adapter', async () => {
    const provider = createMeetingProvider(environment());
    await expect(provider.resolveJoinLink({ appointmentId: 'appointment-a' })).resolves.toEqual({
      provider: 'development',
      joinUrl: 'http://localhost:3000/dev-meetings/appointment-a',
    });
  });
});

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    MEETING_ADAPTER: 'development',
    MEETING_ALLOWED_HOSTS: '',
    ...overrides,
  } as ServerEnvironment;
}
