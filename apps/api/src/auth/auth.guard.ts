import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthRequest, UserRole } from './auth.types';
import { REQUIRED_ROLES } from './roles.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requestedRoles = requiredRoles?.length
      ? requiredRoles
      : isUserRole(request.query.role)
        ? [request.query.role]
        : [];
    if (requestedRoles.length === 0) {
      throw new ForbiddenException('Bu işlem için uygun rol belirtilmeli.');
    }

    let hasValidSession = false;
    const cookieRoles: UserRole[] = ['student', 'teacher', 'admin'];
    const orderedCookieRoles = [
      ...requestedRoles,
      ...cookieRoles.filter((role) => !requestedRoles.includes(role)),
    ];
    for (const role of orderedCookieRoles) {
      const cookieName = `sakanin_${role}_session`;
      const cookie = request.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));
      const token = cookie?.slice(`${cookieName}=`.length);
      if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) continue;

      const user = await this.authService.getUserForSession(token);
      if (!user) continue;
      hasValidSession = true;
      if (user.role !== role || !requestedRoles.includes(user.role)) continue;

      request.user = user;
      return true;
    }

    if (hasValidSession) {
      throw new ForbiddenException('Bu oturum istenen rol ile eşleşmiyor.');
    }
    throw new UnauthorizedException('Giriş yapmanız gerekiyor.');
  }
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'student' || value === 'teacher' || value === 'admin';
}
