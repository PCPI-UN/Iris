import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../domain/errors';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { UpdateProjectDocumentDTO } from '../dto/update-document.dto';

/** Only the administrative routes change the state of a document. */
export const DOCUMENT_STATE_ADMIN_ONLY =
  'El estado de un documento solo lo cambia un administrador de proyectos (PATCH /projects/:id/admin/documents/:documentId/state)';
/** An INACTIVE document was withdrawn by an administrator; only the administrative routes touch it. */
export const DOCUMENT_WITHDRAWN =
  'Este documento fue retirado por un administrador y no se puede modificar';

@Injectable()
export class UpdateProjectDocumentUC {
  constructor(
    @Inject('ProjectRepository')
    private readonly repo: ProjectRepository,
  ) {}

  /**
   * Without `administrative` (participants and event managers, PATCH /projects/documents/:id)
   * the state cannot change and an INACTIVE document cannot be edited: an administrative
   * withdrawal, recorded in the change log, is only undone by the administrative routes.
   */
  async execute(
    input: UpdateProjectDocumentDTO,
    opts: { administrative?: boolean } = {},
  ) {
    const existing = await this.repo.findDocumentById(input.id);
    if (!existing) {
      throw new NotFoundError('No se encontró el documento del proyecto');
    }

    if (!opts.administrative) {
      if (input.state !== undefined) {
        throw new ForbiddenError(DOCUMENT_STATE_ADMIN_ONLY);
      }
      if (existing.state === 'INACTIVE') {
        throw new ForbiddenError(DOCUMENT_WITHDRAWN);
      }
    }

    if (input.url !== undefined && input.url.trim() === '') {
      throw new ConflictError('La URL del documento no puede estar vacía');
    }

    const updated = await this.repo.updateDocument({
      id: input.id,
      type: input.type,
      state: input.state,
      url: input.url,
    });

    return updated;
  }
}
