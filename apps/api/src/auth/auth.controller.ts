import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Query,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthRequest } from './auth.types';
import { Roles } from './roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: Awaited<ReturnType<AuthService['login']>>['user'] }> {
    const input = readObjectBody(body);
    const session = await this.authService.login(input.username, input.password);
    response.cookie(`sakanin_${session.user.role}_session`, session.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
      maxAge: 12 * 60 * 60 * 1000,
      ...(process.env.SESSION_COOKIE_DOMAIN
        ? { domain: process.env.SESSION_COOKIE_DOMAIN }
        : {}),
    });
    return { user: session.user };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getCurrentUser(
    @Query('role') role: string,
    @Req() request: AuthRequest,
  ): AuthRequest['user'] {
    if (request.user.role !== role) {
      throw new ForbiddenException('Bu alan için uygun yetki bulunmuyor.');
    }
    return request.user;
  }

  @UseGuards(AuthGuard)
  @Roles('student', 'teacher', 'admin')
  @Patch('tutorial-complete')
  completeTutorial(@Req() request: AuthRequest) {
    return this.authService.completeTutorial(request.user.id);
  }

  @Post('logout')
  async logout(
    @Query('role') role: string,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    if (!isUserRole(role)) {
      throw new ForbiddenException('Geçerli bir kullanıcı rolü belirtilmeli.');
    }
    const cookieName = `sakanin_${role}_session`;
    const cookie = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`));
    const token = cookie?.slice(`${cookieName}=`.length);
    if (token) await this.authService.logout(token);
    response.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
      ...(process.env.SESSION_COOKIE_DOMAIN
        ? { domain: process.env.SESSION_COOKIE_DOMAIN }
        : {}),
    });
    return { message: 'Oturum kapatıldı.' };
  }
}

function isUserRole(value: string): value is 'student' | 'teacher' | 'admin' {
  return value === 'student' || value === 'teacher' || value === 'admin';
}

function readObjectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnprocessableEntityException('İstek gövdesi geçersiz.');
  }
  return value as Record<string, unknown>;
}
