import {
  ProjectDocument,
  Status,
  TypedDocument,
} from './entities/project.entity';
import { NotFoundError } from './errors';

export const DOCUMENT_STATES: readonly Status[] = ['ACTIVE', 'INACTIVE'];

/**
 * A document as the change log stores it (DOCUMENTS entries): its id, its type, the blob name
 * of its file (never a signed URL) and its state. A replacement changes `url`, a state change
 * changes `state`; the other fields say which document it was.
 */
export interface DocumentLogValue {
  id: number;
  type: TypedDocument;
  url: string;
  state: Status;
}

export const documentLogValue = (
  document: ProjectDocument,
): DocumentLogValue => ({
  id: document.id,
  type: document.type,
  url: document.url,
  state: document.state,
});

/** The document exists and belongs to the project; otherwise NOT_FOUND (also for another project's document). */
export function assertDocumentOfProject(
  document: ProjectDocument | null,
  projectId: number,
  documentId: number,
): asserts document is ProjectDocument {
  if (!document || document.projectId !== projectId) {
    throw new NotFoundError(
      `No se encontró el documento ${documentId} en este proyecto`,
    );
  }
}
