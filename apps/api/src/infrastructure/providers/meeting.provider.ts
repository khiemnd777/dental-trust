import { isIP } from 'node:net';

import type { ServerEnvironment } from '@dental-trust/config/server';

export interface MeetingLinkCommand {
  readonly appointmentId: string;
  readonly manualJoinUrl?: string;
}

export interface MeetingLinkResult {
  readonly provider: 'manual' | 'development';
  readonly joinUrl: string;
}

export interface MeetingProvider {
  readonly name: MeetingLinkResult['provider'];
  resolveJoinLink(command: MeetingLinkCommand): Promise<MeetingLinkResult>;
}

export function createMeetingProvider(environment: ServerEnvironment): MeetingProvider {
  if (environment.MEETING_ADAPTER === 'manual') {
    const allowedHosts = environment.MEETING_ALLOWED_HOSTS.split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length === 0 || allowedHosts.some((host) => !isBarePublicHostname(host))) {
      throw new Error('The manual meeting adapter requires at least one bare public DNS hostname.');
    }
    return new ManualMeetingProvider(new Set(allowedHosts));
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('The development meeting adapter is prohibited in production.');
  }
  return new DevelopmentMeetingProvider(environment.APP_URL);
}

class ManualMeetingProvider implements MeetingProvider {
  readonly name = 'manual' as const;

  constructor(private readonly allowedHosts: ReadonlySet<string>) {}

  async resolveJoinLink(command: MeetingLinkCommand): Promise<MeetingLinkResult> {
    if (!command.manualJoinUrl) throw new Error('A manually provisioned meeting URL is required.');
    const joinUrl = new URL(command.manualJoinUrl);
    if (
      joinUrl.protocol !== 'https:' ||
      joinUrl.username ||
      joinUrl.password ||
      joinUrl.hash ||
      !this.allowedHosts.has(joinUrl.hostname.toLowerCase())
    ) {
      throw new Error('The meeting URL is not an approved HTTPS provider URL.');
    }
    return { provider: this.name, joinUrl: joinUrl.toString() };
  }
}

class DevelopmentMeetingProvider implements MeetingProvider {
  readonly name = 'development' as const;

  constructor(private readonly applicationUrl: string) {}

  async resolveJoinLink(command: MeetingLinkCommand): Promise<MeetingLinkResult> {
    const joinUrl = new URL(`/dev-meetings/${command.appointmentId}`, this.applicationUrl);
    return { provider: this.name, joinUrl: joinUrl.toString() };
  }
}

function isBarePublicHostname(hostname: string): boolean {
  if (
    hostname.length > 253 ||
    !hostname.includes('.') ||
    hostname.startsWith('.') ||
    hostname.endsWith('.') ||
    isIP(hostname) !== 0 ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost')
  ) {
    return false;
  }
  try {
    const parsed = new URL(`https://${hostname}`);
    return (
      parsed.hostname === hostname &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}
