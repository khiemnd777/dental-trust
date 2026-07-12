import { randomUUID } from 'node:crypto';
import { connect as connectNet, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';

import type { ServerEnvironment } from '@dental-trust/config/server';

export interface DeliveryMessage {
  readonly recipient: string;
  readonly subject: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export interface DeliveryProvider {
  send(message: DeliveryMessage): Promise<void>;
}

export interface NotificationProviders {
  readonly email: DeliveryProvider;
  readonly sms: DeliveryProvider;
  readonly messaging: DeliveryProvider;
}

export function createNotificationProviders(environment: ServerEnvironment): NotificationProviders {
  return {
    email: new SmtpEmailProvider(environment),
    sms:
      environment.SMS_PROVIDER_URL && environment.SMS_PROVIDER_TOKEN
        ? new WebhookDeliveryProvider(environment.SMS_PROVIDER_URL, environment.SMS_PROVIDER_TOKEN)
        : new UnavailableDeliveryProvider('SMS_PROVIDER_NOT_CONFIGURED'),
    messaging:
      environment.MESSAGING_PROVIDER_URL && environment.MESSAGING_PROVIDER_TOKEN
        ? new WebhookDeliveryProvider(
            environment.MESSAGING_PROVIDER_URL,
            environment.MESSAGING_PROVIDER_TOKEN,
          )
        : new UnavailableDeliveryProvider('MESSAGING_PROVIDER_NOT_CONFIGURED'),
  };
}

export class UnavailableDeliveryProvider implements DeliveryProvider {
  constructor(private readonly errorCode: string) {}

  async send(): Promise<void> {
    throw new Error(this.errorCode);
  }
}

export class WebhookDeliveryProvider implements DeliveryProvider {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
  ) {}

  async send(message: DeliveryMessage): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        'idempotency-key': message.idempotencyKey,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  }
}

export class SmtpEmailProvider implements DeliveryProvider {
  constructor(private readonly environment: ServerEnvironment) {}

  async send(message: DeliveryMessage): Promise<void> {
    const recipient = safeMailbox(message.recipient);
    const from = safeMailbox(this.environment.SMTP_FROM);
    const socket = this.environment.SMTP_SECURE
      ? connectTls({
          host: this.environment.SMTP_HOST,
          port: this.environment.SMTP_PORT,
          servername: this.environment.SMTP_HOST,
        })
      : connectNet({ host: this.environment.SMTP_HOST, port: this.environment.SMTP_PORT });
    socket.setTimeout(10_000);
    const session = new SmtpSession(socket);
    try {
      await session.connected(this.environment.SMTP_SECURE ? 'secureConnect' : 'connect');
      await session.expect(220);
      await session.command(`EHLO ${hostnameFor(from)}`, 250);
      if (this.environment.SMTP_USERNAME && this.environment.SMTP_PASSWORD) {
        const auth = Buffer.from(
          `\u0000${this.environment.SMTP_USERNAME}\u0000${this.environment.SMTP_PASSWORD}`,
          'utf8',
        ).toString('base64');
        await session.command(`AUTH PLAIN ${auth}`, 235);
      }
      await session.command(`MAIL FROM:<${from}>`, 250);
      await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
      await session.command('DATA', 354);
      socket.write(`${mimeMessage(from, recipient, message)}\r\n.\r\n`);
      await session.expect(250);
      await session.command('QUIT', 221);
    } finally {
      socket.destroy();
    }
  }
}

function safeMailbox(value: string): string {
  const mailbox = value.trim();
  if (/\r|\n/u.test(mailbox) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(mailbox)) {
    throw new Error('INVALID_EMAIL_RECIPIENT');
  }
  return mailbox;
}

function hostnameFor(mailbox: string): string {
  return mailbox.split('@')[1] ?? 'dentaltrust.local';
}

function mimeMessage(from: string, recipient: string, message: DeliveryMessage): string {
  const subject = Buffer.from(safeHeader(message.subject), 'utf8').toString('base64');
  const body = wrapBase64(Buffer.from(message.text, 'utf8').toString('base64'));
  return [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${hostnameFor(from)}>`,
    `From: Dental Trust <${from}>`,
    `To: <${recipient}>`,
    `Subject: =?UTF-8?B?${subject}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    `X-Dental-Trust-Idempotency-Key: ${safeHeader(message.idempotencyKey)}`,
    '',
    body,
  ].join('\r\n');
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').trim();
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/gu)?.join('\r\n') ?? '';
}

class SmtpSession {
  private buffer = '';
  private readonly responses: string[] = [];
  private readonly waiters: ((response: string) => void)[] = [];

  constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.receive(chunk));
  }

  async connected(event: 'connect' | 'secureConnect'): Promise<void> {
    if (event === 'connect' && !this.socket.connecting) return;
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off(event, ready);
        this.socket.off('error', failed);
        this.socket.off('timeout', timedOut);
      };
      const timedOut = () => failed(new Error('SMTP_TIMEOUT'));
      this.socket.once(event, ready);
      this.socket.once('error', failed);
      this.socket.once('timeout', timedOut);
    });
  }

  async command(command: string, expected: number | readonly number[]): Promise<void> {
    this.socket.write(`${command}\r\n`);
    await this.expect(expected);
  }

  async expect(expected: number | readonly number[]): Promise<void> {
    const response = await this.nextResponse();
    const code = Number.parseInt(response.slice(0, 3), 10);
    const accepted = typeof expected === 'number' ? code === expected : expected.includes(code);
    if (!accepted) throw new Error(`SMTP_RESPONSE_${Number.isFinite(code) ? code : 'INVALID'}`);
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop() ?? '';
    let response = '';
    for (const line of lines) {
      response = response ? `${response}\n${line}` : line;
      if (/^\d{3} /u.test(line)) {
        const waiter = this.waiters.shift();
        if (waiter) waiter(response);
        else this.responses.push(response);
        response = '';
      }
    }
    if (response) this.buffer = `${response}\r\n${this.buffer}`;
  }

  private async nextResponse(): Promise<string> {
    const existing = this.responses.shift();
    if (existing) return existing;
    return new Promise<string>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => onError(new Error('SMTP_TIMEOUT'));
      const cleanup = () => {
        this.socket.off('error', onError);
        this.socket.off('timeout', onTimeout);
      };
      this.waiters.push((response) => {
        cleanup();
        resolve(response);
      });
      this.socket.once('error', onError);
      this.socket.once('timeout', onTimeout);
    });
  }
}
