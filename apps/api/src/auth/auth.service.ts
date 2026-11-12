import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit.service';
import { DatabaseService } from '../database.service';
import { UserFileEntry, UsersFileService } from '../admin/users-file.service';
import { AuthenticatedUser, UserRole } from './auth.types';
import { verifyPassword } from './password-hasher';

const SESSION_DURATION_HOURS = 12;

interface UserRow {
  id: string;
  username: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly usersFile: UsersFileService,
  ) {}

  async login(usernameInput: unknown, passwordInput: unknown): Promise<{
    accessToken: string;
    user: AuthenticatedUser;
  }> {
    const username = this.normalizeUsername(usernameInput);
    if (typeof passwordInput !== 'string' || passwordInput.length > 128) {
      throw new UnauthorizedException('Kullanıcı adı veya parola hatalı.');
    }

    let user = await this.usersFile.findByUsername(username);
    if (!user || !(await verifyPassword(passwordInput, user.passwordHash))) {
      await this.audit.record({
        actor: null,
        action: 'auth.login.failed',
        entityType: 'auth',
        details: {
          username:
            typeof usernameInput === 'string' ? usernameInput.slice(0, 32).toLowerCase() : null,
        },
      });
      throw new UnauthorizedException('Kullanıcı adı veya parola hatalı.');
    }
    user = await this.ensureDatabaseUser(user);
    const authenticatedUser = this.toAuthenticatedUser(user);
    const accessToken = this.createToken();
    await this.database.pool.query(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DURATION_HOURS} hours')`,
      [this.hashToken(accessToken), user.id],
    );
    await this.audit.record({
      actor: authenticatedUser,
      action: 'auth.login.succeeded',
      entityType: 'auth',
      entityId: user.id,
    });

    return { accessToken, user: authenticatedUser };
  }

  async getUserForSession(token: string): Promise<AuthenticatedUser | null> {
    const result = await this.database.pool.query<UserRow>(
      `SELECT u.id, u.username, u.role
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [this.hashToken(token)],
    );
    const row = result.rows[0];
    if (!row) return null;
    const user = (await this.usersFile.getUsers()).find((entry) => entry.id === row.id);
    return user ? this.toAuthenticatedUser(user) : null;
  }

  async completeTutorial(userId: string): Promise<AuthenticatedUser> {
    try {
      return this.toAuthenticatedUser(await this.usersFile.completeTutorial(userId));
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('was not found')) {
        throw new NotFoundException('Hesap bulunamadı.');
      }
      throw error;
    }
  }

  async logout(token: string): Promise<void> {
    const result = await this.database.pool.query<UserRow>(
      `SELECT u.id, u.username, u.role
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [this.hashToken(token)],
    );
    await this.database.pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [
      this.hashToken(token),
    ]);
    const row = result.rows[0];
    if (row) {
      const fileUser = (await this.usersFile.getUsers()).find((user) => user.id === row.id);
      await this.audit.record({
        actor: fileUser ? this.toAuthenticatedUser(fileUser) : { ...row, tutorialCompleted: true },
        action: 'auth.logout',
        entityType: 'auth',
        entityId: row.id,
      });
    }
  }

  private async ensureDatabaseUser(user: UserFileEntry): Promise<UserFileEntry> {
    const byUsername = await this.database.pool.query<UserRow>(
      'SELECT id, username, role FROM users WHERE LOWER(username) = $1',
      [user.username],
    );
    const existing = byUsername.rows[0];
    if (existing && existing.id !== user.id) {
      user = await this.usersFile.reassignId(user.id, existing.id);
    }
    await this.database.pool.query(
      `INSERT INTO users (id, username, email, role, email_verified)
       VALUES ($1, $2, NULL, $3, TRUE)
       ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           role = EXCLUDED.role`,
      [user.id, user.username, user.type],
    );
    return user;
  }

  private normalizeUsername(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length > 32 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(value)
    ) {
      throw new UnprocessableEntityException(
        'Kullanıcı adı 3-32 karakter olmalı; harf, rakam, nokta, alt çizgi veya tire içerebilir.',
      );
    }
    return value.toLowerCase();
  }

  private createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(user: UserFileEntry): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      role: user.type,
      tutorialCompleted: user.tutorialCompleted,
    };
  }
}
