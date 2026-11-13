import { Inject, Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "../../domain/errors";
import { ProjectRepository } from "../../domain/repositories/project.repository";
import { UpdateProjectDocumentDTO } from "../dto/update-document.dto";


@Injectable()
export class UpdateProjectDocumentUC {
  constructor(
    @Inject('ProjectRepository')
    private readonly repo: ProjectRepository,
  ) {}

  async execute(input: UpdateProjectDocumentDTO) {
    const existing = await this.repo.findDocumentById(input.id);
    if (!existing) {
      throw new NotFoundError('No se encontró el documento del proyecto');
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