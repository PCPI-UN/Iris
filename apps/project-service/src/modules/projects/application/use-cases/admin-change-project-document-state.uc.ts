import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import { ProjectDocument, Status } from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  assertDocumentOfProject,
  DOCUMENT_STATES,
  documentLogValue,
} from '../../domain/admin-documents';
import { UpdateProjectDocumentUC } from './update-document.uc';

export interface AdminChangeProjectDocumentStateInput {
  projectId: number;
  documentId: number;
  actingUserId: number;
  state?: Status;
  reason?: string;
}

/**
 * Administrative activation or deactivation of a project document. An INACTIVE document is left
 * out of every read of the project (public listings, detail, review, the student's own project
 * and the stable open link); only the administrative list shows it. The change and its
 * DOCUMENTS change log entry (the document with its old and new state) are saved together, with
 * the project row locked. Setting the state the document already has is a 400 and, like a
 * document of another project (NOT_FOUND), leaves no entry.
 */
@Injectable()
export class AdminChangeProjectDocumentStateUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly updateDocument: UpdateProjectDocumentUC,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    input: AdminChangeProjectDocumentStateInput,
  ): Promise<ProjectDocument> {
    const state = input.state;
    if (!state || !DOCUMENT_STATES.includes(state)) {
      throw new ValidationError(
        'El estado del documento debe ser ACTIVE o INACTIVE',
      );
    }
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    return this.uow.run(async () => {
      await this.repo.lockProject(project.id);
      const current = await this.repo.findDocumentById(input.documentId);
      assertDocumentOfProject(current, project.id, input.documentId);
      if (current.state === state) {
        throw new ValidationError(
          state === 'ACTIVE'
            ? 'El documento ya está activo'
            : 'El documento ya está inactivo',
        );
      }

      const updated = await this.updateDocument.execute(
        { id: current.id, state },
        { administrative: true },
      );
      // The state differs, so the entry is never null
      const entry = buildProjectChangeLogEntry({
        projectId: project.id,
        actorUserId: input.actingUserId,
        action: 'DOCUMENTS',
        before: { document: documentLogValue(current) },
        after: { document: documentLogValue(updated) },
        reason: input.reason,
      })!;
      await this.changeLog.create(entry);
      return updated;
    });
  }
}
