import { Module } from '@nestjs/common';
import { UsersFileModule } from '../admin/users-file.module';
import { AuditService } from '../audit.service';
import { DatabaseService } from '../database.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersFileModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, DatabaseService, AuditService],
  exports: [AuthGuard, AuthService, DatabaseService, AuditService],
})
export class AuthModule {}
