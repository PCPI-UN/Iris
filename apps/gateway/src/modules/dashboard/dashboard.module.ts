import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { StudentDashboardController } from './student-dashboard.controller';
import { StudentDashboardService } from './student-dashboard.service';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { EventsModule } from '../events/events.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
    imports: [EvaluationsModule, EventsModule, ProjectsModule],
    controllers: [DashboardController, StudentDashboardController],
    providers: [DashboardService, StudentDashboardService],
})
export class DashboardModule { }
