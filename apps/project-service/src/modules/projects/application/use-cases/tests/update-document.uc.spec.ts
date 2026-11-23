import {
  DOCUMENT_STATE_ADMIN_ONLY,
  DOCUMENT_WITHDRAWN,
  UpdateProjectDocumentUC,
} from '../update-document.uc';
import { ForbiddenError } from '../../../domain/errors';
import {
  ProjectDocument,
  Status,
} from '../../../domain/entities/project.entity';

describe('UpdateProjectDocumentUC', () => {
  const setup = (state: Status) => {
    const stored: ProjectDocument = {
      id: 7,
      projectId: 4,
      type: 'POSTER',
      state,
      url: 'viejo.pdf',
    };
    const repo = {
      findDocumentById: jest.fn().mockResolvedValue(stored),
      updateDocument: jest
        .fn()
        .mockImplementation((input: Partial<ProjectDocument>) =>
          Promise.resolve({ ...stored, ...input }),
        ),
    };
    return {
      uc: new UpdateProjectDocumentUC(
        repo as unknown as ConstructorParameters<
          typeof UpdateProjectDocumentUC
        >[0],
      ),
      repo,
    };
  };

  describe('without administrative (PATCH /projects/documents/:id)', () => {
    it('replaces the file of an ACTIVE document', async () => {
      const { uc, repo } = setup('ACTIVE');

      await uc.execute({ id: 7, url: 'nuevo.pdf' });

      expect(repo.updateDocument).toHaveBeenCalledWith({
        id: 7,
        url: 'nuevo.pdf',
        type: undefined,
        state: undefined,
      });
    });

    it('never changes the state: a withdrawal cannot be undone here', async () => {
      const { uc, repo } = setup('INACTIVE');

      await expect(uc.execute({ id: 7, state: 'ACTIVE' })).rejects.toThrow(
        new ForbiddenError(DOCUMENT_STATE_ADMIN_ONLY),
      );
      expect(repo.updateDocument).not.toHaveBeenCalled();
    });

    it('does not deactivate an ACTIVE document either', async () => {
      const { uc, repo } = setup('ACTIVE');

      await expect(uc.execute({ id: 7, state: 'INACTIVE' })).rejects.toThrow(
        ForbiddenError,
      );
      expect(repo.updateDocument).not.toHaveBeenCalled();
    });

    it('does not edit a document withdrawn by an administrator', async () => {
      const { uc, repo } = setup('INACTIVE');

      await expect(uc.execute({ id: 7, url: 'nuevo.pdf' })).rejects.toThrow(
        new ForbiddenError(DOCUMENT_WITHDRAWN),
      );
      expect(repo.updateDocument).not.toHaveBeenCalled();
    });
  });

  describe('administrative (the admin use cases)', () => {
    it('changes the state and edits INACTIVE documents', async () => {
      const { uc, repo } = setup('INACTIVE');

      await uc.execute({ id: 7, state: 'ACTIVE' }, { administrative: true });
      await uc.execute({ id: 7, url: 'nuevo.pdf' }, { administrative: true });

      expect(repo.updateDocument).toHaveBeenCalledTimes(2);
    });
  });
});
