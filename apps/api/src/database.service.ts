import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be configured');
    }

    this.pool = new Pool({ connectionString });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username TEXT,
        email TEXT UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

      WITH legacy_users AS (
        SELECT
          id,
          COALESCE(
            NULLIF(
              LEFT(
                LOWER(REGEXP_REPLACE(SPLIT_PART(COALESCE(email, ''), '@', 1), '[^a-zA-Z0-9._-]', '', 'g')),
                24
              ),
              ''
            ),
            'user'
          ) AS base_username,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(
              COALESCE(
                NULLIF(
                  LEFT(
                    REGEXP_REPLACE(SPLIT_PART(COALESCE(email, ''), '@', 1), '[^a-zA-Z0-9._-]', '', 'g'),
                    24
                  ),
                  ''
                ),
                'user'
              )
            )
            ORDER BY id
          ) AS duplicate_number
        FROM users
        WHERE username IS NULL
      )
      UPDATE users AS target
      SET username = CASE
        WHEN legacy_users.duplicate_number = 1 THEN legacy_users.base_username
        ELSE legacy_users.base_username || '-' || LEFT(REPLACE(legacy_users.id::TEXT, '-', ''), 8)
      END
      FROM legacy_users
      WHERE target.id = legacy_users.id;

      ALTER TABLE users ALTER COLUMN username SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY,
        actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        actor_username TEXT,
        actor_role TEXT CHECK (actor_role IN ('student', 'teacher', 'admin')),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
        ON audit_logs(created_at DESC);

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenarios (
        id UUID PRIMARY KEY,
        title TEXT NOT NULL,
        scenario_text TEXT NOT NULL,
        context_text TEXT NOT NULL,
        video_url TEXT,
        video_path TEXT,
        perspectives JSONB NOT NULL,
        reflection_questions JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );

      ALTER TABLE scenarios ALTER COLUMN created_by DROP NOT NULL;
      ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_created_by_fkey;
      ALTER TABLE scenarios
        ADD CONSTRAINT scenarios_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS scenarios_status_created_at_idx
        ON scenarios(status, created_at DESC);
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS video_url TEXT;
      ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS video_path TEXT;

      CREATE TABLE IF NOT EXISTS student_scenario_responses (
        student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        classification TEXT CHECK (classification IN ('joke', 'bullying')),
        reasoning TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (student_id, scenario_id)
      );
      ALTER TABLE student_scenario_responses
        ADD COLUMN IF NOT EXISTS classification TEXT CHECK (classification IN ('joke', 'bullying'));
      ALTER TABLE student_scenario_responses ADD COLUMN IF NOT EXISTS reasoning TEXT;

      CREATE TABLE IF NOT EXISTS expert_questions (
        id UUID PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
        question TEXT NOT NULL,
        answer TEXT,
        answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        answered_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS expert_questions_created_at_idx
        ON expert_questions(created_at DESC);
    `);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
