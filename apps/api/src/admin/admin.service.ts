import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { QueryResult } from 'pg';
import { AuditService } from '../audit.service';
import { DatabaseService } from '../database.service';
import { AuthenticatedUser, UserRole } from '../auth/auth.types';
import { UsersFileService, UserFileEntry } from './users-file.service';

interface UserRow {
  id: string;
  username: string;
  role: UserRole;
  created_at: Date;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly usersFile: UsersFileService,
  ) {}

  async listUsers(): Promise<Array<{
    id: string;
    username: string;
    role: UserRole;
    createdAt: string;
  }>> {
    const users = await this.usersFile.getUsers();
    const synced: UserFileEntry[] = [];
    for (const user of users) synced.push(await this.syncMetadata(user));
    return synced.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.type,
      createdAt: user.createdAt,
    }));
  }

  async createUser(
    input: unknown,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; username: string; role: UserRole; createdAt: string }> {
    const body = readBody(input);
    const username = validateUsername(body.username);
    const role = validateRole(body.role);
    const password = validatePassword(body.password);
    if ((await this.usersFile.getUsers()).some((user) => user.username === username)) {
      throw new ConflictException('Bu kullanıcı adı zaten kullanılıyor.');
    }

    const existing = await this.database.pool.query<UserRow>(
      'SELECT id, username, role, created_at FROM users WHERE LOWER(username) = $1',
      [username],
    );
    const user = await this.usersFile.upsert({
      id: existing.rows[0]?.id ?? randomUUID(),
      username,
      role,
      password,
    });
    try {
      await this.writeMetadata(user);
    } catch (error: unknown) {
      await this.usersFile.remove(user.id);
      throwUniqueViolation(error);
      throw error;
    }
    await this.audit.record({
      actor,
      action: 'account.created',
      entityType: 'user',
      entityId: user.id,
      details: { username, role },
    });
    return toUser(user);
  }

  async updateUser(
    idInput: unknown,
    input: unknown,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; username: string; role: UserRole; createdAt: string }> {
    const id = validateId(idInput);
    const body = readBody(input);
    const username = body.username === undefined ? undefined : validateUsername(body.username);
    const password = body.password === undefined ? undefined : validatePassword(body.password);
    const role = body.role === undefined ? undefined : validateRole(body.role);
    if (username === undefined && password === undefined && role === undefined) {
      throw new UnprocessableEntityException('Kullanıcı adı, rol veya yeni parola girilmeli.');
    }
    const existing = (await this.usersFile.getUsers()).find((user) => user.id === id);
    if (!existing) throw new NotFoundException('Hesap bulunamadı.');
    if (
      username !== undefined &&
      (await this.usersFile.getUsers()).some(
        (user) => user.id !== id && user.username === username,
      )
    ) {
      throw new ConflictException('Bu kullanıcı adı zaten kullanılıyor.');
    }

    const updated = await this.usersFile.upsert({
      previousUsername: existing.username,
      username: username ?? existing.username,
      role: role ?? existing.type,
      password,
    });
    try {
      await this.writeMetadata(updated);
    } catch (error: unknown) {
      await this.usersFile.upsert({
        previousUsername: updated.username,
        username: existing.username,
        role: existing.type,
        passwordHash: existing.passwordHash,
      });
      throwUniqueViolation(error);
      throw error;
    }
    await this.database.pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);

    await this.audit.record({
      actor,
      action: 'account.updated',
      entityType: 'user',
      entityId: id,
      details: {
        fields: [
          ...(username === undefined ? [] : ['username']),
          ...(password === undefined ? [] : ['password']),
          ...(role === undefined ? [] : ['role']),
        ],
        ...(username === undefined ? {} : { username: updated.username }),
        ...(role === undefined ? {} : { role: updated.type }),
      },
    });
    return toUser(updated);
  }

  async deleteUser(idInput: unknown, actor: AuthenticatedUser): Promise<{ message: string }> {
    const id = validateId(idInput);
    if (id === actor.id) {
      throw new ConflictException('Kullanmakta olduğunuz yönetici hesabını silemezsiniz.');
    }
    const existing = (await this.usersFile.getUsers()).find((user) => user.id === id);
    if (!existing) throw new NotFoundException('Hesap bulunamadı.');
    await this.usersFile.remove(id);
    try {
      await this.database.pool.query('DELETE FROM users WHERE id = $1', [id]);
    } catch (error: unknown) {
      await this.usersFile.restore(existing);
      throw error;
    }
    await this.audit.record({
      actor,
      action: 'account.deleted',
      entityType: 'user',
      entityId: id,
      details: { username: existing.username, role: existing.type },
    });
    return { message: 'Hesap ve bu hesaba bağlı yanıtlar/sorular silindi.' };
  }

  private async syncMetadata(input: UserFileEntry): Promise<UserFileEntry> {
    const result = await this.database.pool.query<UserRow>(
      'SELECT id, username, role, created_at FROM users WHERE LOWER(username) = $1',
      [input.username],
    );
    const existing = result.rows[0];
    const user =
      existing && existing.id !== input.id
        ? await this.usersFile.reassignId(input.id, existing.id)
        : input;
    await this.writeMetadata(user);
    return user;
  }

  private async writeMetadata(user: UserFileEntry): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO users (id, username, email, role, email_verified)
       VALUES ($1, $2, NULL, $3, TRUE)
       ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           role = EXCLUDED.role`,
      [user.id, user.username, user.type],
    );
  }
}

function toUser(user: UserFileEntry): {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
} {
  return {
    id: user.id,
    username: user.username,
    role: user.type,
    createdAt: user.createdAt,
  };
}

function readBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnprocessableEntityException('İstek gövdesi geçersiz.');
  }
  return value as Record<string, unknown>;
}

function validateUsername(value: unknown): string {
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

function validatePassword(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 12 ||
    value.length > 128 ||
    value.trim() !== value
  ) {
    throw new UnprocessableEntityException(
      'Parola 12-128 karakter olmalı ve başında/sonunda boşluk içermemeli.',
    );
  }
  return value;
}

function validateRole(value: unknown): UserRole {
  if (value !== 'student' && value !== 'teacher' && value !== 'admin') {
    throw new UnprocessableEntityException('Rol student, teacher veya admin olmalı.');
  }
  return value;
}

function validateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new UnprocessableEntityException('Hesap kimliği geçersiz.');
  }
  return value;
}

function throwUniqueViolation(error: unknown): void {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  ) {
    throw new ConflictException('Bu kullanıcı adı zaten kullanılıyor.');
  }
}
