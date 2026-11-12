import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from './auth/auth.types';
import { DatabaseService } from './database.service';

export interface AuditEventInput {
  actor: AuthenticatedUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

interface AuditLogRow {
  id: string;
  actor_username: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(event: AuditEventInput): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO audit_logs
         (id, actor_user_id, actor_username, actor_role, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        event.actor?.id ?? null,
        event.actor?.username ?? null,
        event.actor?.role ?? null,
        event.action,
        event.entityType,
        event.entityId ?? null,
        JSON.stringify(event.details ?? {}),
      ],
    );
  }

  async list(
    limitInput: unknown,
    offsetInput: unknown,
    userIdInput: unknown,
  ): Promise<{ logs: Array<{
    id: string;
    actorUsername: string | null;
    actorRole: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  }>; hasMore: boolean }> {
    const limit = typeof limitInput === 'string' && /^\d+$/.test(limitInput)
      ? Math.min(Math.max(Number(limitInput), 1), 200)
      : 100;
    const offset =
      typeof offsetInput === 'string' && /^\d+$/.test(offsetInput)
        ? Math.min(Number(offsetInput), 2_147_483_647)
        : 0;
    let userId: string | null = null;
    if (userIdInput !== undefined && userIdInput !== '') {
      if (typeof userIdInput !== 'string' || !isUuid(userIdInput)) {
        throw new UnprocessableEntityException('Kullanıcı kimliği geçersiz.');
      }
      userId = userIdInput;
    }
    const result = await this.database.pool.query<AuditLogRow>(
      `SELECT id, actor_username, actor_role, action, entity_type, entity_id, details, created_at
       FROM audit_logs
       WHERE ($1::uuid IS NULL OR actor_user_id = $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit + 1, offset],
    );
    return {
      logs: result.rows.slice(0, limit).map((row) => ({
        id: row.id,
        actorUsername: row.actor_username,
        actorRole: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: row.details,
        createdAt: row.created_at.toISOString(),
      })),
      hasMore: result.rows.length > limit,
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
