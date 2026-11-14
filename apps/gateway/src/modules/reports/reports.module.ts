import { Module } from '@nestjs/common';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { EventsModule } from '../events/events.module';
import { ReportsController } from './reports.controller';
import { EvaluationReportService } from './evaluation-report.service';

@Module({
  imports: [EventsModule, EvaluationsModule],
  controllers: [ReportsController],
  providers: [EvaluationReportService],
})
export class ReportsModule {}
