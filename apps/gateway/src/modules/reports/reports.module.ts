import { Module } from '@nestjs/common';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { EventsModule } from '../events/events.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReportsController } from './reports.controller';
import { EvaluationReportService } from './evaluation-report.service';

@Module({
  imports: [EventsModule, EvaluationsModule, ProjectsModule],
  controllers: [ReportsController],
  providers: [EvaluationReportService],
})
export class ReportsModule {}
