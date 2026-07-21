import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import type { MetricsRegistry } from '@dental-trust/observability';

import { METRICS } from '../common/tokens.js';
import { HealthDependencyProbe } from './health-dependency-probe.js';
import { HealthNetworkGuard } from './health-network.guard.js';
import { InternalHealthGuard } from './internal-health.guard.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthDependencyProbe) private readonly dependencies: HealthDependencyProbe,
    @Inject(METRICS) private readonly metricsRegistry: MetricsRegistry,
  ) {}

  @Get('live')
  @SkipThrottle({ default: true, network: true })
  @UseGuards(HealthNetworkGuard)
  live(): Readonly<Record<string, unknown>> {
    return {
      status: 'ok',
      service: 'dental-trust-api',
      version: process.env.BUILD_VERSION ?? 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  @SkipThrottle({ default: true, network: true })
  @UseGuards(HealthNetworkGuard, InternalHealthGuard)
  async ready(): Promise<Readonly<Record<string, unknown>>> {
    try {
      await this.dependencies.check();
    } catch {
      throw new ServiceUnavailableException('A required readiness dependency is unavailable.');
    }
    return {
      status: 'ready',
      dependencies: { database: 'available', redis: 'available', objectStorage: 'available' },
    };
  }

  @Get('metrics')
  @SkipThrottle({ default: true, network: true })
  @UseGuards(HealthNetworkGuard, InternalHealthGuard)
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    return this.metricsRegistry.renderPrometheus();
  }
}
