import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { EventsModule } from '../events/events.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { AuthModule } from '../auth/auth.module';
import { DiplomasModule } from '../diplomas/diplomas.module';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';

@Module({
  imports: [
    ProjectsModule,
    EventsModule,
    EvaluationsModule,
    AuthModule,
    DiplomasModule,
  ],
  controllers: [AcademicController],
  providers: [AcademicService],
})
export class AcademicModule {}
