import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import { ProjectDocument } from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  assertDocumentOfProject,
  documentLogValue,
} from '../../domain/admin-documents';
import { UpdateProjectDocumentUC } from './update-document.uc';

export interface AdminReplaceProjectDocumentInput {
  projectId: number;
  documentId: number;
  actingUserId: number;
  /** Blob name of the new file, already uploaded by the gateway */
  url: string;
  reason?: string;
}

/**
 * Administrative replacement of the file of a project document: the document keeps its id,
 * type and state and points to the new file. The replacement and its DOCUMENTS change log entry
 * (the document with its old and new file) are saved together, with the project row locked, so
 * the old file in the entry is always the one replaced. A document of another project is
 * NOT_FOUND and leaves no entry. The old blob is kept in the storage.
 */
@Injectable()
export class AdminReplaceProjectDocumentUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly updateDocument: UpdateProjectDocumentUC,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    input: AdminReplaceProjectDocumentInput,
  ): Promise<ProjectDocument> {
    const url = input.url?.trim();
    if (!url) {
      throw new ValidationError('Falta el archivo nuevo del documento');
    }
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    return this.uow.run(async () => {
      await this.repo.lockProject(project.id);
      const current = await this.repo.findDocumentById(input.documentId);
      assertDocumentOfProject(current, project.id, input.documentId);

      const updated = await this.updateDocument.execute({
        id: current.id,
        url,
      });
      const entry = buildProjectChangeLogEntry({
        projectId: project.id,
        actorUserId: input.actingUserId,
        action: 'DOCUMENTS',
        before: { document: documentLogValue(current) },
        after: { document: documentLogValue(updated) },
        reason: input.reason,
      });
      // Null only if the new blob name equals the old one: nothing changed
      if (entry) await this.changeLog.create(entry);
      return updated;
    });
  }
}
