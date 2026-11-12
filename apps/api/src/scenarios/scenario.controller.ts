import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Put,
  Req,
  Res,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ScenarioService } from './scenario.service';
import { Scenario, ScenarioDetail, ScenarioSummary } from './scenario.types';
import { MAX_VIDEO_BYTES, MEDIA_DIRECTORY } from './scenario-media';

@Controller('scenarios')
@UseGuards(AuthGuard, RolesGuard)
export class ScenarioController {
  constructor(private readonly scenarioService: ScenarioService) {}

  @Get('manage')
  @Roles('admin')
  listForAdmin(): Promise<ScenarioSummary[]> {
    return this.scenarioService.listForAdmin();
  }

  @Get('manage/:id')
  @Roles('admin')
  getForAdmin(@Param('id') id: string): Promise<Scenario> {
    return this.scenarioService.getForAdmin(id);
  }

  @Post('manage')
  @Roles('admin')
  createDraft(
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ): Promise<Scenario> {
    return this.scenarioService.createDraft(body, request.user);
  }

  @Put('manage/:id')
  @Roles('admin')
  updateDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ): Promise<Scenario> {
    return this.scenarioService.updateDraft(id, body, request.user);
  }

  @Delete('manage/:id')
  @Roles('admin')
  deleteScenario(@Param('id') id: string, @Req() request: AuthRequest): Promise<{ message: string }> {
    return this.scenarioService.deleteScenario(id, request.user);
  }

  @Post('manage/:id/video')
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('video', {
      dest: MEDIA_DIRECTORY,
      limits: { fileSize: MAX_VIDEO_BYTES },
    }),
  )
  uploadVideo(
    @Param('id') id: string,
    @UploadedFile()
    file: { mimetype: string; path: string; size: number } | undefined,
    @Req() request: AuthRequest,
  ): Promise<Scenario> {
    if (!file) throw new UnprocessableEntityException('Yüklenecek video dosyası seçilmeli.');
    return this.scenarioService.uploadVideo(id, file, request.user);
  }

  @Get('admin/responses')
  @Roles('admin')
  listResponses(
    @Query('studentId') studentId?: string,
    @Query('scenarioId') scenarioId?: string,
  ) {
    return this.scenarioService.listResponses(studentId, scenarioId);
  }

  @Get(':id/video')
  @Roles('student', 'teacher', 'admin')
  async video(
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.sendFile(await this.scenarioService.getVideoPath(id, request.user));
  }

  @Post('manage/:id/publish')
  @Roles('admin')
  publish(@Param('id') id: string, @Req() request: AuthRequest): Promise<Scenario> {
    return this.scenarioService.publish(id, request.user);
  }

  @Post('manage/:id/unpublish')
  @Roles('admin')
  unpublish(@Param('id') id: string, @Req() request: AuthRequest): Promise<Scenario> {
    return this.scenarioService.unpublish(id, request.user);
  }

  @Get('review')
  @Roles('teacher')
  listPublishedForTeacher(): Promise<Scenario[]> {
    return this.scenarioService.listPublishedForReview();
  }

  @Get()
  @Roles('student')
  listPublished(@Req() request: AuthRequest): Promise<ScenarioSummary[]> {
    return this.scenarioService.listPublished(request.user.id);
  }

  @Get(':id')
  @Roles('student')
  getPublished(
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ): Promise<ScenarioDetail> {
    return this.scenarioService.getPublished(id, request.user);
  }

  @Post(':id/responses')
  @Roles('student')
  saveAnswers(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ): Promise<{ updatedAt: string }> {
    return this.scenarioService.saveAnswers(
      id,
      request.user,
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { answers?: unknown }).answers
        : undefined,
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { classification?: unknown }).classification
        : undefined,
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { reasoning?: unknown }).reasoning
        : undefined,
    );
  }
}
