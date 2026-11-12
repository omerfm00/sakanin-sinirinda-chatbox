import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';

@Module({
  imports: [AuthModule],
  controllers: [ScenarioController],
  providers: [RolesGuard, ScenarioService],
})
export class ScenarioModule {}
