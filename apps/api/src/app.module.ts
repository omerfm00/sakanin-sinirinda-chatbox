import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ExpertQuestionsModule } from './expert-questions/expert-questions.module';
import { ScenarioModule } from './scenarios/scenario.module';

@Module({
  imports: [AuthModule, AdminModule, ExpertQuestionsModule, ScenarioModule],
  controllers: [HealthController],
})
export class AppModule {}
