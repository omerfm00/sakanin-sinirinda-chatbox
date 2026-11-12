import {
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { AuditService } from '../audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { DatabaseService } from '../database.service';
import { MAX_VIDEO_BYTES, MEDIA_DIRECTORY } from './scenario-media';
import {
  Perspective,
  ReflectionQuestion,
  Scenario,
  ScenarioContent,
  ScenarioDetail,
  ScenarioStatus,
  ScenarioSummary,
} from './scenario.types';

interface ScenarioRow {
  id: string;
  title: string;
  scenario_text: string;
  context_text: string;
  perspectives: Perspective[];
  reflection_questions: ReflectionQuestion[];
  status: ScenarioStatus;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  video_url: string | null;
  video_path: string | null;
  answers?: Record<string, string>;
  has_response?: boolean;
  classification?: 'joke' | 'bullying' | null;
  reasoning?: string | null;
}

@Injectable()
export class ScenarioService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await mkdir(MEDIA_DIRECTORY, { recursive: true });
  }

  async listForAdmin(): Promise<ScenarioSummary[]> {
    const result = await this.database.pool.query<ScenarioRow>(
      `SELECT id, title, status, created_at, published_at
       FROM scenarios
       ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.toSummary(row));
  }

  async getForAdmin(idInput: unknown): Promise<Scenario> {
    const id = this.validateId(idInput);
    const result = await this.database.pool.query<ScenarioRow>(
      `SELECT * FROM scenarios WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Senaryo bulunamadı.');
    return this.toScenario(row);
  }

  async createDraft(input: unknown, actor: AuthenticatedUser): Promise<Scenario> {
    const content = this.parseContent(input, false);
    const result = await this.database.pool.query<ScenarioRow>(
      `INSERT INTO scenarios
         (id, title, scenario_text, context_text, video_url, perspectives, reflection_questions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        randomUUID(),
        content.title,
        content.scenarioText,
        content.context,
        content.videoUrl || null,
        JSON.stringify(content.perspectives),
        JSON.stringify(content.reflectionQuestions),
        actor.id,
      ],
    );
    const scenario = this.toScenario(result.rows[0]);
    await this.audit.record({
      actor,
      action: 'content.created',
      entityType: 'scenario',
      entityId: scenario.id,
      details: { title: scenario.title },
    });
    return scenario;
  }

  async updateDraft(
    idInput: unknown,
    input: unknown,
    actor: AuthenticatedUser,
  ): Promise<Scenario> {
    const id = this.validateId(idInput);
    const parsedContent = this.parseContent(input, true);
    const current = await this.database.pool.query<{
      status: ScenarioStatus;
      reflection_questions: ReflectionQuestion[];
    }>(
      `SELECT status, reflection_questions FROM scenarios WHERE id = $1`,
      [id],
    );
    if (current.rowCount === 0) throw new NotFoundException('Senaryo bulunamadı.');
    if (current.rows[0].status !== 'draft') {
      throw new ConflictException('Yayımlanmış senaryoyu değiştirmek için önce yayından alın.');
    }

    const previousQuestions = new Map(
      current.rows[0].reflection_questions.map((question) => [question.id, question.text]),
    );
    const content: ScenarioContent = {
      ...parsedContent,
      reflectionQuestions: parsedContent.reflectionQuestions.map((question) =>
        previousQuestions.has(question.id) && previousQuestions.get(question.id) !== question.text
          ? { ...question, id: randomUUID() }
          : question,
      ),
    };
    const result = await this.database.pool.query<ScenarioRow>(
      `UPDATE scenarios
       SET title = $2,
           scenario_text = $3,
           context_text = $4,
         video_url = $5,
         perspectives = $6,
         reflection_questions = $7,
         updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [
        id,
        content.title,
        content.scenarioText,
        content.context,
        content.videoUrl || null,
        JSON.stringify(content.perspectives),
        JSON.stringify(content.reflectionQuestions),
      ],
    );
    if (result.rowCount === 0) await this.throwForMissingOrPublished(id);
    const scenario = this.toScenario(result.rows[0]);
    await this.audit.record({
      actor,
      action: 'content.updated',
      entityType: 'scenario',
      entityId: scenario.id,
      details: { title: scenario.title },
    });
    return scenario;
  }

  async publish(idInput: unknown, actor: AuthenticatedUser): Promise<Scenario> {
    const id = this.validateId(idInput);
    const result = await this.database.pool.query<ScenarioRow>(
      `UPDATE scenarios
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [id],
    );
    if (result.rowCount === 0) await this.throwForMissingOrPublished(id);
    const scenario = this.toScenario(result.rows[0]);
    await this.audit.record({
      actor,
      action: 'content.published',
      entityType: 'scenario',
      entityId: scenario.id,
      details: { title: scenario.title },
    });
    return scenario;
  }

  async unpublish(idInput: unknown, actor: AuthenticatedUser): Promise<Scenario> {
    const id = this.validateId(idInput);
    const result = await this.database.pool.query<ScenarioRow>(
      `UPDATE scenarios
       SET status = 'draft', published_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'published'
       RETURNING *`,
      [id],
    );
    if (result.rowCount === 0) {
      const current = await this.database.pool.query(
        `SELECT id FROM scenarios WHERE id = $1`,
        [id],
      );
      if (current.rowCount === 0) throw new NotFoundException('Senaryo bulunamadı.');
      throw new ConflictException('Senaryo zaten taslak durumunda.');
    }
    const scenario = this.toScenario(result.rows[0]);
    await this.audit.record({
      actor,
      action: 'content.unpublished',
      entityType: 'scenario',
      entityId: scenario.id,
      details: { title: scenario.title },
    });
    return scenario;
  }

  async deleteScenario(
    idInput: unknown,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const id = this.validateId(idInput);
    const current = await this.database.pool.query<{
      title: string;
      status: ScenarioStatus;
      video_path: string | null;
    }>(
      `SELECT title, status, video_path FROM scenarios WHERE id = $1`,
      [id],
    );
    const scenario = current.rows[0];
    if (!scenario) throw new NotFoundException('Senaryo bulunamadı.');
    await this.database.pool.query('DELETE FROM scenarios WHERE id = $1', [id]);
    if (scenario.video_path) await this.removeMedia(scenario.video_path);
    await this.audit.record({
      actor,
      action: 'content.deleted',
      entityType: 'scenario',
      entityId: id,
      details: { title: scenario.title, status: scenario.status },
    });
    return { message: 'Senaryo ve ona bağlı öğrenci yanıtları silindi.' };
  }

  async uploadVideo(
    idInput: unknown,
    file: { mimetype: string; path: string; size: number },
    actor: AuthenticatedUser,
  ): Promise<Scenario> {
    const id = this.validateId(idInput);
    const extensions: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
    };
    const extension = extensions[file.mimetype];
    const temporaryPath = resolve(file.path);
    const header = Buffer.alloc(16);
    let bytesRead = 0;
    if (extension) {
      const handle = await open(temporaryPath, 'r');
      try {
        ({ bytesRead } = await handle.read(header, 0, header.length, 0));
      } finally {
        await handle.close();
      }
    }
    const signatureIsValid =
      (file.mimetype === 'video/mp4' && header.subarray(4, 8).toString() === 'ftyp') ||
      (file.mimetype === 'video/webm' &&
        header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) ||
      (file.mimetype === 'video/ogg' && header.subarray(0, 4).toString() === 'OggS');
    if (
      !extension ||
      file.size <= 0 ||
      file.size > MAX_VIDEO_BYTES ||
      bytesRead < 4 ||
      !signatureIsValid ||
      resolve(temporaryPath, '..') !== resolve(MEDIA_DIRECTORY)
    ) {
      await this.removeMedia(basename(temporaryPath));
      throw new UnprocessableEntityException(
        'Yalnızca MP4, WebM veya Ogg video dosyası (en fazla 100 MB) yüklenebilir.',
      );
    }

    const current = await this.database.pool.query<{
      status: ScenarioStatus;
      video_path: string | null;
    }>('SELECT status, video_path FROM scenarios WHERE id = $1', [id]);
    const row = current.rows[0];
    if (!row) {
      await this.removeMedia(basename(temporaryPath));
      throw new NotFoundException('Senaryo bulunamadı.');
    }
    if (row.status !== 'draft') {
      await this.removeMedia(basename(temporaryPath));
      throw new ConflictException('Videoyu değiştirmek için önce senaryoyu yayından alın.');
    }

    const filename = `${randomUUID()}${extension}`;
    const destination = join(MEDIA_DIRECTORY, filename);
    await rename(temporaryPath, destination);
    try {
      const result = await this.database.pool.query<ScenarioRow>(
        `UPDATE scenarios
         SET video_path = $2, video_url = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'draft'
         RETURNING *`,
        [id, filename],
      );
      if (row.video_path) await this.removeMedia(row.video_path);
      const scenario = this.toScenario(result.rows[0]);
      await this.audit.record({
        actor,
        action: 'content.video.uploaded',
        entityType: 'scenario',
        entityId: id,
        details: { fileType: extension },
      });
      return scenario;
    } catch (error: unknown) {
      await this.removeMedia(filename);
      throw error;
    }
  }

  async getVideoPath(idInput: unknown, actor: AuthenticatedUser): Promise<string> {
    const id = this.validateId(idInput);
    const result = await this.database.pool.query<{
      status: ScenarioStatus;
      video_path: string | null;
    }>('SELECT status, video_path FROM scenarios WHERE id = $1', [id]);
    const scenario = result.rows[0];
    if (!scenario || !scenario.video_path) throw new NotFoundException('Video bulunamadı.');
    if (actor.role !== 'admin' && scenario.status !== 'published') {
      throw new ForbiddenException('Taslak senaryo videosuna erişim izniniz yok.');
    }
    return this.mediaPath(scenario.video_path);
  }

  async listResponses(studentIdInput?: string, scenarioIdInput?: string): Promise<Array<{
    studentId: string;
    studentUsername: string;
    scenarioId: string;
    scenarioTitle: string;
    answers: Record<string, string>;
    reflectionQuestions: ReflectionQuestion[];
    classification: 'joke' | 'bullying' | null;
    reasoning: string | null;
    updatedAt: string;
  }>> {
    const studentId = studentIdInput ? this.validateId(studentIdInput) : null;
    const scenarioId = scenarioIdInput ? this.validateId(scenarioIdInput) : null;
    const result = await this.database.pool.query<{
      student_id: string;
      student_username: string;
      scenario_id: string;
      scenario_title: string;
      answers: Record<string, string>;
      reflection_questions: ReflectionQuestion[];
      classification: 'joke' | 'bullying' | null;
      reasoning: string | null;
      updated_at: Date;
    }>(
      `SELECT r.student_id, u.username AS student_username, r.scenario_id,
              s.title AS scenario_title, s.reflection_questions, r.answers,
              r.classification, r.reasoning, r.updated_at
       FROM student_scenario_responses r
       JOIN users u ON u.id = r.student_id
       JOIN scenarios s ON s.id = r.scenario_id
       WHERE ($1::uuid IS NULL OR r.student_id = $1)
         AND ($2::uuid IS NULL OR r.scenario_id = $2)
       ORDER BY r.updated_at DESC
       `,
      [studentId, scenarioId],
    );
    return result.rows.map((row) => ({
      studentId: row.student_id,
      studentUsername: row.student_username,
      scenarioId: row.scenario_id,
      scenarioTitle: row.scenario_title,
      answers: row.answers,
      reflectionQuestions: row.reflection_questions,
      classification: row.classification,
      reasoning: row.reasoning,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async listPublished(studentId: string): Promise<ScenarioSummary[]> {
    const result = await this.database.pool.query<ScenarioRow>(
      `SELECT s.id, s.title, s.status, s.created_at, s.published_at,
              EXISTS (
                SELECT 1 FROM student_scenario_responses r
                WHERE r.scenario_id = s.id AND r.student_id = $1
                  AND (r.answers <> '{}'::jsonb OR r.classification IS NOT NULL)
              ) AS has_response
       FROM scenarios s
       WHERE s.status = 'published'
       ORDER BY s.published_at DESC`,
      [studentId],
    );
    return result.rows.map((row) => this.toSummary(row));
  }

  async listPublishedForReview(): Promise<Scenario[]> {
    const result = await this.database.pool.query<ScenarioRow>(
      `SELECT * FROM scenarios
       WHERE status = 'published'
       ORDER BY published_at DESC`,
    );
    return result.rows.map((row) => this.toScenario(row));
  }

  async getPublished(
    idInput: unknown,
    actor: AuthenticatedUser,
  ): Promise<ScenarioDetail> {
    const id = this.validateId(idInput);
    const result = await this.database.pool.query<ScenarioRow>(
      `SELECT s.*, COALESCE(r.answers, '{}'::jsonb) AS answers,
              r.classification, r.reasoning
       FROM scenarios s
       LEFT JOIN student_scenario_responses r
         ON r.scenario_id = s.id AND r.student_id = $2
       WHERE s.id = $1 AND s.status = 'published'`,
      [id, actor.id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Yayımlanmış senaryo bulunamadı.');
    const currentQuestionIds = new Set(
      row.reflection_questions.map((question) => question.id),
    );
    const answers = Object.fromEntries(
      Object.entries(row.answers ?? {}).filter(([questionId]) =>
        currentQuestionIds.has(questionId),
      ),
    );
    await this.audit.record({
      actor,
      action: 'student.scenario.viewed',
      entityType: 'scenario',
      entityId: id,
    });
    return {
      ...this.toScenario(row),
      answers,
      classification: row.classification ?? null,
      reasoning: row.reasoning ?? '',
    };
  }

  async saveAnswers(
    idInput: unknown,
    actor: AuthenticatedUser,
    answersInput: unknown,
    classificationInput: unknown,
    reasoningInput: unknown,
  ): Promise<{ updatedAt: string }> {
    const id = this.validateId(idInput);
    const answers = this.parseAnswers(answersInput);
    if (classificationInput !== 'joke' && classificationInput !== 'bullying') {
      throw new UnprocessableEntityException('Şaka veya zorbalık değerlendirmesi seçilmeli.');
    }
    if (
      typeof reasoningInput !== 'string' ||
      reasoningInput.trim().length < 3 ||
      reasoningInput.trim().length > 3000
    ) {
      throw new UnprocessableEntityException('Gerekçe 3-3000 karakter arasında olmalı.');
    }
    const reasoning = reasoningInput.trim();
    const scenarioResult = await this.database.pool.query<{
      reflection_questions: ReflectionQuestion[];
    }>(
      `SELECT reflection_questions
       FROM scenarios
       WHERE id = $1 AND status = 'published'`,
      [id],
    );
    const scenario = scenarioResult.rows[0];
    if (!scenario) throw new NotFoundException('Yayımlanmış senaryo bulunamadı.');

    const questionIds = new Set(scenario.reflection_questions.map((question) => question.id));
    if (Object.keys(answers).some((questionId) => !questionIds.has(questionId))) {
      throw new UnprocessableEntityException('Yanıtlarda geçersiz bir soru bulunuyor.');
    }

    const result = await this.database.pool.query<{ updated_at: Date }>(
      `INSERT INTO student_scenario_responses
         (student_id, scenario_id, answers, classification, reasoning)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, scenario_id)
       DO UPDATE SET
         answers = EXCLUDED.answers,
         classification = EXCLUDED.classification,
         reasoning = EXCLUDED.reasoning,
         updated_at = NOW()
       RETURNING updated_at`,
      [actor.id, id, JSON.stringify(answers), classificationInput, reasoning],
    );
    await this.audit.record({
      actor,
      action: 'student.response.saved',
      entityType: 'scenario',
      entityId: id,
      details: {
        answeredQuestionCount: Object.keys(answers).length,
        classification: classificationInput,
      },
    });
    return { updatedAt: result.rows[0].updated_at.toISOString() };
  }

  private async throwForMissingOrPublished(id: string): Promise<never> {
    const current = await this.database.pool.query<{ status: ScenarioStatus }>(
      `SELECT status FROM scenarios WHERE id = $1`,
      [id],
    );
    if (current.rowCount === 0) throw new NotFoundException('Senaryo bulunamadı.');
    throw new ConflictException('Yayımlanmış senaryoyu değiştirmek için önce yayından alın.');
  }

  private parseContent(value: unknown, preserveIds: boolean): ScenarioContent {
    const input = this.readObject(value, 'Senaryo içeriği');
    const title = this.readText(input.title, 'Başlık');
    const scenarioText = this.readText(input.scenarioText, 'Senaryo metni');
    const context = this.readText(input.context, 'Bağlam');
    const videoUrl = this.parseVideoUrl(input.videoUrl);

    if (!Array.isArray(input.perspectives) || input.perspectives.length < 2) {
      throw new UnprocessableEntityException('En az iki bakış açısı ekleyin.');
    }
    const perspectives = input.perspectives.map((item, index) => {
      const perspective = this.readObject(item, `Bakış açısı ${index + 1}`);
      return {
        id: this.readItemId(perspective.id, preserveIds),
        label: this.readText(perspective.label, `Bakış açısı ${index + 1} başlığı`),
        text: this.readText(perspective.text, `Bakış açısı ${index + 1} metni`),
      };
    });

    if (!Array.isArray(input.reflectionQuestions) || input.reflectionQuestions.length < 1) {
      throw new UnprocessableEntityException('En az bir yansıtıcı soru ekleyin.');
    }
    const reflectionQuestions = input.reflectionQuestions.map((item, index) => {
      const question = this.readObject(item, `Yansıtıcı soru ${index + 1}`);
      return {
        id: this.readItemId(question.id, preserveIds),
        text: this.readText(question.text, `Yansıtıcı soru ${index + 1}`),
      };
    });

    this.ensureUniqueIds([
      ...perspectives.map((item) => item.id),
      ...reflectionQuestions.map((item) => item.id),
    ]);

    return { title, scenarioText, context, videoUrl, perspectives, reflectionQuestions };
  }

  private parseVideoUrl(value: unknown): string {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || value.length > 2048) {
      throw new UnprocessableEntityException('Video adresi geçersiz.');
    }
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new UnprocessableEntityException('Video adresi geçerli bir URL olmalı.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new UnprocessableEntityException('Video adresi HTTP veya HTTPS kullanmalı.');
    }
    return url.toString();
  }

  private parseAnswers(value: unknown): Record<string, string> {
    const input = this.readObject(value, 'Yanıtlar');
    const entries = Object.entries(input);
    const answers: Record<string, string> = {};
    for (const [questionId, answer] of entries) {
      if (!this.isUuid(questionId) || typeof answer !== 'string') {
        throw new UnprocessableEntityException('Yanıt biçimi geçersiz.');
      }
      const trimmedAnswer = answer.trim();
      if (trimmedAnswer) answers[questionId] = trimmedAnswer;
    }
    return answers;
  }

  private readObject(value: unknown, field: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new UnprocessableEntityException(`${field} geçersiz.`);
    }
    return value as Record<string, unknown>;
  }

  private readText(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new UnprocessableEntityException(`${field} boş bırakılamaz.`);
    }
    return value.trim();
  }

  private readItemId(value: unknown, preserve: boolean): string {
    if (!preserve || value === undefined) return randomUUID();
    if (!this.isUuid(value)) {
      throw new UnprocessableEntityException('İçerik öğesi kimliği geçersiz.');
    }
    return value;
  }

  private ensureUniqueIds(ids: string[]): void {
    if (new Set(ids).size !== ids.length) {
      throw new UnprocessableEntityException('İçerik öğesi kimlikleri benzersiz olmalı.');
    }
  }

  private validateId(value: unknown): string {
    if (!this.isUuid(value)) {
      throw new UnprocessableEntityException('Senaryo kimliği geçersiz.');
    }
    return value;
  }

  private isUuid(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }

  private toScenario(row: ScenarioRow): Scenario {
    return {
      id: row.id,
      title: row.title,
      scenarioText: row.scenario_text,
      context: row.context_text,
      videoUrl: row.video_url ?? '',
      uploadedVideoUrl: row.video_path ? `/api/scenarios/${row.id}/video` : '',
      perspectives: row.perspectives,
      reflectionQuestions: row.reflection_questions,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
    };
  }

  private toSummary(row: ScenarioRow): ScenarioSummary {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
      ...(row.has_response === undefined ? {} : { hasResponse: row.has_response }),
    };
  }

  private mediaPath(filename: string): string {
    if (basename(filename) !== filename || filename.includes('..')) {
      throw new Error('Stored video filename is invalid.');
    }
    return join(MEDIA_DIRECTORY, filename);
  }

  private async removeMedia(filename: string): Promise<void> {
    try {
      await unlink(this.mediaPath(filename));
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') return;
      throw error;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
