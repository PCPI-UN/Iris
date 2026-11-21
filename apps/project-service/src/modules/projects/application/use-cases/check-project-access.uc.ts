import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import {
  ProjectAccessAction,
  canAccessProject,
  jurorUserIds,
} from '../../domain/project-access';

export interface CheckProjectAccessInput {
  userId: number;
  action: ProjectAccessAction;
  /** The project, or the document whose project is checked */
  projectId?: number;
  documentId?: number;
}

/**
 * Throws ForbiddenError unless the user may read or edit the project (domain/project-access.ts).
 * Returns the id of the project that was checked, which is useful when the caller only has
 * a document id.
 */
@Injectable()
export class CheckProjectAccessUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
  ) {}

  async execute(input: CheckProjectAccessInput): Promise<{ projectId: number }> {
    const projectId = await this.resolveProjectId(input);

    const project = await this.repo.findById(projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    const isParticipant = await this.repo.isUserParticipant(projectId, input.userId);
    if (isParticipant) return { projectId };

    const [assignments, permissions] = await Promise.all([
      input.action === 'READ' ? this.repo.listAssignments(projectId) : Promise.resolve([]),
      this.auth.getUserPermissions(input.userId),
    ]);

    const allowed = canAccessProject(input.userId, input.action, {
      isParticipant,
      assignedJurorUserIds: jurorUserIds(assignments),
      permissions,
    });
    if (!allowed) {
      throw new ForbiddenError(
        input.action === 'READ'
          ? 'Solo los participantes, los jurados asignados o el personal de la plataforma pueden ver este proyecto'
          : 'Solo los participantes del proyecto o quien administra eventos pueden modificarlo',
      );
    }
    return { projectId };
  }

  private async resolveProjectId(input: CheckProjectAccessInput): Promise<number> {
    if (input.documentId) {
      const document = await this.repo.findDocumentById(input.documentId);
      if (!document) throw new NotFoundError('No se encontró el documento');
      return document.projectId;
    }
    if (input.projectId) return input.projectId;
    throw new ValidationError('Se requiere projectId o documentId');
  }
}
