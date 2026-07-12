import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { loadWorkspaceEnvironment, parseServerEnvironment } from '@dental-trust/config/server';

import { PinoNestLogger } from './common/pino-nest.logger.js';
import { LOGGER } from './common/tokens.js';

loadWorkspaceEnvironment();

async function bootstrap(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(new PinoNestLogger(app.get<Logger>(LOGGER)));
  app.setGlobalPrefix('api/v1');
  const apiHeaders = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
  });
  const swaggerHeaders = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  app.use((request: Request, response: Response, next: NextFunction) =>
    request.path.startsWith('/api/docs')
      ? swaggerHeaders(request, response, next)
      : apiHeaders(request, response, next),
  );
  app.enableCors({
    origin: environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-request-id',
      'x-idempotency-key',
      'x-organization-id',
      'x-csrf-token',
      'traceparent',
    ],
    exposedHeaders: [
      'x-request-id',
      'traceparent',
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
    ],
  });
  app.enableShutdownHooks();

  if (environment.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('DENTAL TRUST API')
        .setDescription('Versioned API for verified cross-border dental care coordination.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }

  await app.listen(environment.PORT, '0.0.0.0');
}

bootstrap().catch(async (error: unknown) => {
  console.error('API bootstrap failed', error instanceof Error ? error.message : 'unknown error');
  const { prisma } = await import('@dental-trust/database');
  await prisma.$disconnect();
  process.exitCode = 1;
});
