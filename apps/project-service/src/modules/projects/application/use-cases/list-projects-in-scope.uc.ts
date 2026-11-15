import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ProjectInScope } from '../../domain/entities/project.entity';
import { ListProjectsInScopeDTO } from '../dto/projects-in-scope.dto';
import { ResolveProjectReadScopeUC } from './resolve-project-read-scope.uc';
import { AttachParticipantNamesUC } from './attach-participant-names.uc';

export const MAX_ITEMS_PER_PAGE = 100;

export interface ProjectsInScopePage {
  items: ProjectInScope[];
  total: number;
  currentPage: number;
  itemsOnCurrentPage: number;
  itemsPerPage: number;
  totalPages: number;
}

/** Projects the user may read (tutored, of their course sections or department, or all). */
@Injectable()
export class ListProjectsInScopeUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly resolveScope: ResolveProjectReadScopeUC,
    private readonly attachNames: AttachParticipantNamesUC,
  ) {}

  async execute(input: ListProjectsInScopeDTO): Promise<ProjectsInScopePage> {
    const currentPage = input.currentPage && input.currentPage > 0 ? input.currentPage : 1;
    const itemsPerPage =
      input.itemsPerPage && input.itemsPerPage > 0 ? Math.min(input.itemsPerPage, MAX_ITEMS_PER_PAGE) : 10;

    const scope = await this.resolveScope.execute(input.userId);
    const { items: rows, total } = scope
      ? await this.repo.listInScope(scope, {
          eventId: input.eventId,
          state: input.state,
          academicCourseId: input.academicCourseId,
          q: input.q?.trim() || undefined,
          currentPage,
          itemsPerPage,
        })
      : { items: [], total: 0 };
    const items = await this.attachNames.execute(rows);

    return {
      items,
      total,
      currentPage,
      itemsOnCurrentPage: items.length,
      itemsPerPage,
      totalPages: Math.ceil(total / itemsPerPage),
    };
  }
}
