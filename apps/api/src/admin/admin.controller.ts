import {
  Body,
  Delete,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.adminService.createUser(body, request.user);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.adminService.updateUser(id, body, request.user);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @Req() request: AuthRequest) {
    return this.adminService.deleteUser(id, request.user);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Query('userId') userId: string,
  ) {
    return this.audit.list(limit, offset, userId);
  }
}
