import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ProjectsModule } from '../projects/projects.module';
import { DiplomasController } from './diplomas.controller';
import { DiplomasService } from './diplomas.service';
import { DiplomaPdfRenderer } from './diploma.pdf';

@Module({
  imports: [EventsModule, ProjectsModule],
  controllers: [DiplomasController],
  providers: [
    DiplomasService,
    { provide: DiplomaPdfRenderer, useFactory: () => new DiplomaPdfRenderer() },
  ],
  // hasDiploma() for the student dashboard; the academic diploma and its availability
  exports: [DiplomasService],
})
export class DiplomasModule {}
