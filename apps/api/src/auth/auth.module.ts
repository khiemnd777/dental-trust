import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionAuthGuard } from './session-auth.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordHasher, SessionAuthGuard],
  exports: [SessionAuthGuard],
})
export class AuthModule {}
