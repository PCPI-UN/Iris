import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ProjectInScope } from '../../domain/repositories/project.repository';
import { NotFoundError } from '../../domain/errors';
import { GetProjectInScopeDTO } from '../dto/projects-in-scope.dto';
import { ResolveProjectReadScopeUC } from './resolve-project-read-scope.uc';
import { AttachParticipantNamesUC } from './attach-participant-names.uc';

/**
 * One project the user may read. A project outside the scope gives the same NOT_FOUND
 * as a missing one, so the answer does not reveal that it exists.
 */
@Injectable()
export class GetProjectInScopeUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly resolveScope: ResolveProjectReadScopeUC,
    private readonly attachNames: AttachParticipantNamesUC,
  ) {}

  async execute(input: GetProjectInScopeDTO): Promise<ProjectInScope> {
    const scope = await this.resolveScope.execute(input.userId);
    const project = scope ? await this.repo.findInScope(scope, input.projectId) : null;
    if (!project) throw new NotFoundError(`No se encontró el proyecto con ID ${input.projectId}`);
    const [withNames] = await this.attachNames.execute([project]);
    return withNames;
  }
}
