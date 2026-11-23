import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { AdminReplaceProjectDocumentUC } from '../admin-replace-project-document.uc';
import { AdminChangeProjectDocumentStateUC } from '../admin-change-project-document-state.uc';
import { UpdateProjectDocumentUC } from '../update-document.uc';
import { ListDocumentsUC } from '../list-documents.uc';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import { ProjectDocument } from '../../../domain/entities/project.entity';

describe('Administrative project documents', () => {
  const doc = (overrides: Partial<ProjectDocument> = {}): ProjectDocument => ({
    id: 7,
    projectId: 4,
    type: 'POSTER',
    state: 'ACTIVE',
    url: '1700000000000-poster-viejo.pdf',
    ...overrides,
  });

  const setup = (stored: ProjectDocument | null = doc()) => {
    const inTransaction: string[] = [];
    let open = false;
    const uow = {
      run: jest.fn(async (work: () => Promise<unknown>) => {
        open = true;
        try {
          return await work();
        } finally {
          open = false;
        }
      }),
    };
    const track = <A extends unknown[], T>(
      name: string,
      impl: (...args: A) => T,
    ) =>
      jest.fn((...args: A) => {
        if (open) inTransaction.push(name);
        return Promise.resolve(impl(...args));
      });
    let current = stored;
    const repo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 4, eventId: 9, name: 'Robot' }),
      lockProject: track('lock', () => undefined),
      findDocumentById: track('find', () => current),
      updateDocument: track('update', (input: Partial<ProjectDocument>) => {
        current = {
          ...(current as ProjectDocument),
          ...Object.fromEntries(
            Object.entries(input).filter(([, v]) => v !== undefined),
          ),
        };
        return current;
      }),
    };
    const changeLog = {
      create: track('changeLog', () => ({ id: 1 })),
      listByProject: jest.fn(),
    };
    const updateDocument = new UpdateProjectDocumentUC(repo as any);
    const replace = new AdminReplaceProjectDocumentUC(
      repo as any,
      updateDocument,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    const changeState = new AdminChangeProjectDocumentStateUC(
      repo as any,
      updateDocument,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    return { replace, changeState, repo, changeLog, inTransaction };
  };

  describe('AdminReplaceProjectDocumentUC', () => {
    it('points the document to the new blob and logs DOCUMENTS with the old and new file', async () => {
      const { replace, repo, changeLog, inTransaction } = setup();

      const updated = await replace.execute({
        projectId: 4,
        documentId: 7,
        actingUserId: 1,
        url: '1800000000000-poster-nuevo.pdf',
        reason: ' Póster equivocado ',
      });

      expect(updated).toMatchObject({
        id: 7,
        url: '1800000000000-poster-nuevo.pdf',
        type: 'POSTER',
        state: 'ACTIVE',
      });
      expect(repo.updateDocument).toHaveBeenCalledWith({
        id: 7,
        url: '1800000000000-poster-nuevo.pdf',
        type: undefined,
        state: undefined,
      });
      expect(changeLog.create).toHaveBeenCalledWith({
        projectId: 4,
        actorUserId: 1,
        action: 'DOCUMENTS',
        before: {
          document: {
            id: 7,
            type: 'POSTER',
            url: '1700000000000-poster-viejo.pdf',
            state: 'ACTIVE',
          },
        },
        after: {
          document: {
            id: 7,
            type: 'POSTER',
            url: '1800000000000-poster-nuevo.pdf',
            state: 'ACTIVE',
          },
        },
        reason: 'Póster equivocado',
      });
      // The lock, the read of the old file, the write and its entry share the transaction
      expect(inTransaction).toEqual([
        'lock',
        'find',
        'find',
        'update',
        'changeLog',
      ]);
    });

    it('keeps the state of an INACTIVE document', async () => {
      const { replace } = setup(doc({ state: 'INACTIVE' }));

      const updated = await replace.execute({
        projectId: 4,
        documentId: 7,
        actingUserId: 1,
        url: 'nuevo.pdf',
      });

      expect(updated.state).toBe('INACTIVE');
    });

    it('answers NOT_FOUND for a document of another project and leaves no entry', async () => {
      const { replace, repo, changeLog } = setup(doc({ projectId: 99 }));

      await expect(
        replace.execute({
          projectId: 4,
          documentId: 7,
          actingUserId: 1,
          url: 'x.pdf',
        }),
      ).rejects.toThrow(NotFoundError);
      expect(repo.updateDocument).not.toHaveBeenCalled();
      expect(changeLog.create).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND for an unknown document or project', async () => {
      const unknownDocument = setup(null);
      await expect(
        unknownDocument.replace.execute({
          projectId: 4,
          documentId: 70,
          actingUserId: 1,
          url: 'x.pdf',
        }),
      ).rejects.toThrow('No se encontró el documento 70 en este proyecto');

      const unknownProject = setup();
      unknownProject.repo.findById.mockResolvedValue(null);
      await expect(
        unknownProject.replace.execute({
          projectId: 4,
          documentId: 7,
          actingUserId: 1,
          url: 'x.pdf',
        }),
      ).rejects.toThrow('No se encontró el proyecto');
      expect(unknownProject.changeLog.create).not.toHaveBeenCalled();
    });

    it('rejects an empty file name before reading anything', async () => {
      const { replace, repo } = setup();

      await expect(
        replace.execute({
          projectId: 4,
          documentId: 7,
          actingUserId: 1,
          url: '  ',
        }),
      ).rejects.toThrow(ValidationError);
      expect(repo.findById).not.toHaveBeenCalled();
    });
  });

  describe('AdminChangeProjectDocumentStateUC', () => {
    it('deactivates a supporting document and logs DOCUMENTS with the old and new state', async () => {
      const { changeState, changeLog, inTransaction } = setup(
        doc({ type: 'SUPPORTING_DOCUMENT', url: 'soporte.pdf' }),
      );

      const updated = await changeState.execute({
        projectId: 4,
        documentId: 7,
        actingUserId: 1,
        state: 'INACTIVE',
      });

      expect(updated.state).toBe('INACTIVE');
      expect(changeLog.create).toHaveBeenCalledWith({
        projectId: 4,
        actorUserId: 1,
        action: 'DOCUMENTS',
        before: {
          document: {
            id: 7,
            type: 'SUPPORTING_DOCUMENT',
            url: 'soporte.pdf',
            state: 'ACTIVE',
          },
        },
        after: {
          document: {
            id: 7,
            type: 'SUPPORTING_DOCUMENT',
            url: 'soporte.pdf',
            state: 'INACTIVE',
          },
        },
        reason: null,
      });
      expect(inTransaction).toEqual([
        'lock',
        'find',
        'find',
        'update',
        'changeLog',
      ]);
    });

    it('reactivates an INACTIVE document', async () => {
      const { changeState, changeLog } = setup(doc({ state: 'INACTIVE' }));

      const updated = await changeState.execute({
        projectId: 4,
        documentId: 7,
        actingUserId: 1,
        state: 'ACTIVE',
        reason: 'Se retiró por error',
      });

      expect(updated.state).toBe('ACTIVE');
      expect(changeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Se retiró por error' }),
      );
    });

    it('answers 400 when the document already has that state, without an entry', async () => {
      const { changeState, repo, changeLog } = setup();

      await expect(
        changeState.execute({
          projectId: 4,
          documentId: 7,
          actingUserId: 1,
          state: 'ACTIVE',
        }),
      ).rejects.toThrow(new ValidationError('El documento ya está activo'));
      expect(repo.updateDocument).not.toHaveBeenCalled();
      expect(changeLog.create).not.toHaveBeenCalled();
    });

    it('answers 400 for a missing or unknown state', async () => {
      const { changeState, repo } = setup();

      await expect(
        changeState.execute({ projectId: 4, documentId: 7, actingUserId: 1 }),
      ).rejects.toThrow(ValidationError);
      await expect(
        changeState.execute({
          projectId: 4,
          documentId: 7,
          actingUserId: 1,
          state: 'DELETED' as ProjectDocument['state'],
        }),
      ).rejects.toThrow(ValidationError);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND for a document of another project and leaves no entry', async () => {
      const { changeState, repo, changeLog } = setup(doc({ projectId: 99 }));

      await expect(
        changeState.execute({
          projectId: 4,
          documentId: 7,
          actingUserId: 1,
          state: 'INACTIVE',
        }),
      ).rejects.toThrow(NotFoundError);
      expect(repo.updateDocument).not.toHaveBeenCalled();
      expect(changeLog.create).not.toHaveBeenCalled();
    });
  });

  describe('ListDocumentsUC', () => {
    const listSetup = () => {
      const repo = {
        findById: jest.fn().mockResolvedValue({ id: 4 }),
        listDocuments: jest.fn().mockResolvedValue([]),
      };
      return { uc: new ListDocumentsUC(repo as any), repo };
    };

    it('lists only the ACTIVE documents by default', async () => {
      const { uc, repo } = listSetup();
      await uc.execute({ projectId: 4 });
      expect(repo.listDocuments).toHaveBeenCalledWith(4, {
        includeInactive: false,
      });
    });

    it('lists the INACTIVE documents too for the administrative list', async () => {
      const { uc, repo } = listSetup();
      await uc.execute({ projectId: 4, includeInactive: true });
      expect(repo.listDocuments).toHaveBeenCalledWith(4, {
        includeInactive: true,
      });
    });
  });
});
