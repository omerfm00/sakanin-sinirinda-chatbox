import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExpertQuestionsService } from './expert-questions.service';

@Controller('expert-questions')
@UseGuards(AuthGuard, RolesGuard)
export class ExpertQuestionsController {
  constructor(private readonly questions: ExpertQuestionsService) {}

  @Post()
  @Roles('student')
  create(
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.questions.create(body, request.user);
  }

  @Get('mine')
  @Roles('student')
  listMine(@Req() request: AuthRequest) {
    return this.questions.listMine(request.user.id);
  }

  @Get()
  @Roles('teacher', 'admin')
  listForStaff() {
    return this.questions.listForStaff();
  }

  @Patch(':id/answer')
  @Roles('teacher')
  answer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.questions.answer(id, body, request.user);
  }
}
