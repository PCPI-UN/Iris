import { ProjectsController } from '../projects.controller';
import { NotFoundError } from '../../../domain/errors';

describe('ProjectsService administrative documents RPCs', () => {
  const build = (deps: Record<string, unknown>) => {
    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, deps);
    return controller;
  };
  const document = {
    id: 7,
    projectId: 4,
    type: 'POSTER',
    state: 'INACTIVE',
    url: 'nuevo.pdf',
  };

  it('AdminReplaceProjectDocument passes the blob name and returns the document as proto', async () => {
    const execute = jest.fn().mockResolvedValue(document);

    const res = await build({
      adminReplaceProjectDocumentUC: { execute },
    }).adminReplaceProjectDocumentRpc({
      projectId: 4,
      documentId: 7,
      actingUserId: 1,
      url: 'nuevo.pdf',
      reason: 'Póster equivocado',
    });

    expect(execute).toHaveBeenCalledWith({
      projectId: 4,
      documentId: 7,
      actingUserId: 1,
      url: 'nuevo.pdf',
      reason: 'Póster equivocado',
    });
    expect(res.document).toMatchObject({
      id: 7,
      projectId: 4,
      url: 'nuevo.pdf',
      type: 2,
      state: 2,
    });
  });

  it('AdminChangeProjectDocumentState maps the proto state, and leaves 0 undefined', async () => {
    const execute = jest.fn().mockResolvedValue(document);
    const controller = build({
      adminChangeProjectDocumentStateUC: { execute },
    });

    await controller.adminChangeProjectDocumentStateRpc({
      projectId: 4,
      documentId: 7,
      actingUserId: 1,
      state: 2,
    });
    await controller.adminChangeProjectDocumentStateRpc({
      projectId: 4,
      documentId: 7,
      actingUserId: 1,
      state: 0,
    });

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ state: 'INACTIVE' }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ state: undefined }),
    );
  });

  it('lets NOT_FOUND through (document of another project)', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(
        new NotFoundError('No se encontró el documento 7 en este proyecto'),
      );

    await expect(
      build({
        adminChangeProjectDocumentStateUC: { execute },
      }).adminChangeProjectDocumentStateRpc({
        projectId: 4,
        documentId: 7,
        actingUserId: 1,
        state: 2,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('ListProjectDocuments includes the INACTIVE documents only when asked', async () => {
    const execute = jest.fn().mockResolvedValue([document]);
    const controller = build({ listDocs: { execute } });

    await controller.listProjectDocumentsRpc({ projectId: 4 });
    await controller.listProjectDocumentsRpc({
      projectId: 4,
      includeInactive: true,
    });

    expect(execute.mock.calls).toEqual([
      [{ projectId: 4, includeInactive: false }],
      [{ projectId: 4, includeInactive: true }],
    ]);
  });
});
