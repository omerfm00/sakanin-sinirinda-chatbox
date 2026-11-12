import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { UserRole } from './auth/auth.types';

type UserEntry = {
  id: string;
  type: UserRole;
  username: string;
};

async function provisionUsers(): Promise<void> {
  const filePath = resolve(
    process.env.USERS_FILE ?? resolve(__dirname, '../../../config/users.json'),
  );
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be configured.');
  }

  const content = await readFile(filePath, 'utf8');
  const document: unknown = JSON.parse(content);
  const users = validateDocument(document);
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    let createdCount = 0;
    await client.query('BEGIN');
    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (id, username, email, role, email_verified)
         VALUES ($1, $2, NULL, $3, TRUE)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [user.id, user.username, user.type],
      );
      if (result.rowCount === 0) {
        continue;
      }
      createdCount += 1;
      await client.query(
        `INSERT INTO audit_logs
           (id, actor_user_id, actor_username, actor_role, action, entity_type, entity_id, details)
         VALUES ($1, NULL, NULL, NULL, 'account.provisioned', 'user', $2, $3)`,
        [
          randomUUID(),
          result.rows[0].id,
          JSON.stringify({ username: user.username, role: user.type }),
        ],
      );
    }
    await client.query('COMMIT');
    console.info(
      `Created ${createdCount} user account(s); skipped ${users.length - createdCount} existing account(s).`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function validateDocument(value: unknown): UserEntry[] {
  if (!isRecord(value) || !Array.isArray(value.users)) {
    throw new Error('Users file must contain a "users" array.');
  }

  const usernames = new Set<string>();
  return value.users.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`users[${index}] must be an object.`);
    }

    const { id, type, username, passwordHash } = entry;
    if (type !== 'student' && type !== 'teacher' && type !== 'admin') {
      throw new Error(`users[${index}].type must be student, teacher, or admin.`);
    }
    if (
      typeof username !== 'string' ||
      username.length > 32 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(username)
    ) {
      throw new Error(
        `users[${index}].username must be 3-32 letters, numbers, dots, underscores, or hyphens.`,
      );
    }
    const normalizedUsername = username.toLowerCase();
    if (usernames.has(normalizedUsername)) {
      throw new Error(`Username "${username}" appears more than once in the users file.`);
    }
    usernames.add(normalizedUsername);

    if (typeof id !== 'string' || !isUuid(id)) {
      throw new Error(`users[${index}].id must be a UUID. Start the API once to migrate older files.`);
    }
    if (
      typeof passwordHash === 'string' &&
      /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash)
    ) {
      return { id, type, username: normalizedUsername };
    }
    throw new Error(`users[${index}].passwordHash must be a valid hash.`);
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void provisionUsers().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'User provisioning failed.');
  process.exitCode = 1;
});
