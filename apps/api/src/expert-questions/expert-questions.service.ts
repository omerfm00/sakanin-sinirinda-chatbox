import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { DatabaseService } from '../database.service';

interface ExpertQuestionRow {
  id: string;
  student_id: string;
  student_username: string;
  scenario_id: string | null;
  scenario_title: string | null;
  question: string;
  answer: string | null;
  answered_by_username: string | null;
  created_at: Date;
  answered_at: Date | null;
}

@Injectable()
export class ExpertQuestionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(input: unknown, actor: AuthenticatedUser) {
    const body = readBody(input);
    const question = readQuestion(body.question);
    const scenarioId = body.scenarioId === undefined
      ? null
      : validateId(body.scenarioId);

    if (scenarioId !== null) {
      const scenario = await this.database.pool.query(
        `SELECT id FROM scenarios WHERE id = $1 AND status = 'published'`,
        [scenarioId],
      );
      if (scenario.rowCount === 0) {
        throw new UnprocessableEntityException('Yayımlanmış senaryo bulunamadı.');
      }
    }

    const result = await this.database.pool.query<ExpertQuestionRow>(
      `INSERT INTO expert_questions (id, student_id, scenario_id, question)
       VALUES ($1, $2, $3, $4)
       RETURNING id, student_id, scenario_id, question, answer, created_at, answered_at`,
      [randomUUID(), actor.id, scenarioId, question],
    );
    await this.audit.record({
      actor,
      action: 'expert_question.created',
      entityType: 'expert_question',
      entityId: result.rows[0].id,
      details: { scenarioId },
    });
    return toQuestion(result.rows[0], actor.username);
  }

  async listMine(studentId: string) {
    const result = await this.database.pool.query<ExpertQuestionRow>(
      `${this.selectQuestions()}
       WHERE q.student_id = $1
       ORDER BY q.created_at DESC`,
      [studentId],
    );
    return result.rows.map((row) => toQuestion(row));
  }

  async listForStaff() {
    const result = await this.database.pool.query<ExpertQuestionRow>(
      `${this.selectQuestions()}
       ORDER BY q.created_at DESC`,
    );
    return result.rows.map((row) => toQuestion(row));
  }

  async answer(idInput: unknown, input: unknown, actor: AuthenticatedUser) {
    const id = validateId(idInput);
    const body = readBody(input);
    const answer = readAnswer(body.answer);
    const updated = await this.database.pool.query(
      `UPDATE expert_questions
       SET answer = $2, answered_by = $3, answered_at = NOW()
       WHERE id = $1`,
      [id, answer, actor.id],
    );
    if (updated.rowCount === 0) throw new NotFoundException('Soru bulunamadı.');
    const result = await this.database.pool.query<ExpertQuestionRow>(
      `${this.selectQuestions()} WHERE q.id = $1`,
      [id],
    );
    const row = result.rows[0];

    await this.audit.record({
      actor,
      action: 'expert_question.answered',
      entityType: 'expert_question',
      entityId: id,
    });
    return toQuestion(row);
  }

  private selectQuestions(): string {
    return `SELECT q.id, q.student_id, student.username AS student_username,
                   q.scenario_id, scenario.title AS scenario_title,
                   q.question, q.answer, q.answered_at,
                   expert.username AS answered_by_username, q.created_at
            FROM expert_questions q
            JOIN users student ON student.id = q.student_id
            LEFT JOIN scenarios scenario ON scenario.id = q.scenario_id
            LEFT JOIN users expert ON expert.id = q.answered_by`;
  }
}

function toQuestion(row: ExpertQuestionRow, studentUsername?: string) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    scenarioId: row.scenario_id,
    scenarioTitle: row.scenario_title,
    studentUsername: row.student_username ?? studentUsername ?? null,
    answeredByUsername: row.answered_by_username,
    createdAt: row.created_at.toISOString(),
    answeredAt: row.answered_at?.toISOString() ?? null,
  };
}

function readBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnprocessableEntityException('İstek gövdesi geçersiz.');
  }
  return value as Record<string, unknown>;
}

function readQuestion(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 4000) {
    throw new UnprocessableEntityException('Soru 3-4000 karakter olmalı.');
  }
  return value.trim();
}

function readAnswer(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 4000) {
    throw new UnprocessableEntityException('Yanıt 1-4000 karakter olmalı.');
  }
  return value.trim();
}

function validateId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new UnprocessableEntityException('Kimlik geçersiz.');
  }
  return value;
}
