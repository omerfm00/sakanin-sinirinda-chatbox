import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { ExpertQuestionsController } from './expert-questions.controller';
import { ExpertQuestionsService } from './expert-questions.service';

@Module({
  imports: [AuthModule],
  controllers: [ExpertQuestionsController],
  providers: [RolesGuard, ExpertQuestionsService],
})
export class ExpertQuestionsModule {}
