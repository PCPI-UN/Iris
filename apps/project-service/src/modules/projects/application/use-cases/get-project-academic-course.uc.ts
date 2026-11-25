import { Inject, Injectable } from '@nestjs/common';
import {
  AcademicCourseView,
  ProjectRepository,
} from '../../domain/repositories/project.repository';

/**
 * Course section (NRC) of a project for its complete read. Null for a project of an event
 * that requires none (0) or created before course sections existed (-1).
 */
@Injectable()
export class GetProjectAcademicCourseUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
  ) {}

  execute(projectId: number): Promise<AcademicCourseView | null> {
    return this.repo.findAcademicCourseOfProject(projectId);
  }
}
