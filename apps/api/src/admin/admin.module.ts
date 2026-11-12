import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersFileModule } from './users-file.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule, UsersFileModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
})
export class AdminModule {}
