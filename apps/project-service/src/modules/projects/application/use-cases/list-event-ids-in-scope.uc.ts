import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ListEventIdsInScopeDTO } from '../dto/projects-in-scope.dto';
import { ResolveProjectReadScopeUC } from './resolve-project-read-scope.uc';

/** Events where at least one project the user may read takes part. */
@Injectable()
export class ListEventIdsInScopeUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly resolveScope: ResolveProjectReadScopeUC,
  ) {}

  async execute(input: ListEventIdsInScopeDTO): Promise<number[]> {
    const scope = await this.resolveScope.execute(input.userId, input.scope);
    return scope ? this.repo.listEventIdsInScope(scope) : [];
  }
}
