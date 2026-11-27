import {
  ProjectImportOutcome,
  ProjectImportParticipantStatus,
  ProjectImportRow,
} from '@app/common/generated/project';
import { ProjectsController } from '../projects.controller';
import { PreconditionError } from '../../../domain/errors';

describe('ProjectsService project import', () => {
  const build = (ucs: {
    preview?: jest.Mock;
    execute?: jest.Mock;
    template?: jest.Mock;
  }) => {
    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, {
      previewProjectImportUC: { execute: ucs.preview },
      executeProjectImportUC: { execute: ucs.execute },
      getProjectImportTemplateUC: { execute: ucs.template },
    });
    return controller;
  };

  const protoRow = (
    change: Partial<ProjectImportRow> = {},
  ): ProjectImportRow => ({
    rowNumber: 4,
    categoryName: 'Sistemas',
    nrc: '1001',
    name: 'Robot',
    description: '',
    projectCode: '',
    state: 0,
    participants: [
      {
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@uni.edu',
        studentCode: '1',
        semester: '6',
        career: 'Sistemas',
        slot: 1,
      },
    ],
    tutorEmails: ['profe@uni.edu'],
    formatErrors: [],
    ...change,
  });

  const createdRow = {
    rowNumber: 4,
    outcome: 'CREATED',
    message: 'Creado con 1 integrante (1 sin cuenta).',
    projectName: 'Robot',
    categoryName: 'Sistemas',
    state: 'UNDER_REVIEW',
    participants: [{ email: 'ana@uni.edu', status: 'NO_ACCOUNT' }],
    projectId: 40,
    failedEffects: ['INVITATION'],
  };

  it('PreviewProjectImport leaves an unset state to the use case and answers the enums of the contract', async () => {
    const preview = jest.fn().mockResolvedValue({
      rows: [
        {
          rowNumber: 4,
          outcome: 'SKIP',
          message: 'Ya existe en el evento (Id 40); se omite.',
          projectName: 'Robot',
          categoryName: 'Sistemas',
          state: 'APPROVED',
          participants: [{ email: 'ana@uni.edu', status: 'HAS_ACCOUNT' }],
          projectId: 40,
        },
        {
          rowNumber: 5,
          outcome: 'ERROR',
          message: 'La categoría «X» no existe en este evento.',
          projectName: 'Otro',
          state: 'UNDER_REVIEW',
          participants: [],
        },
      ],
      totals: {
        rows: 2,
        toCreate: 0,
        skipped: 1,
        errors: 1,
        participants: 0,
        withoutAccount: 0,
      },
      eventWarnings: [],
      canConfirm: false,
    });

    const res = await build({ preview }).previewProjectImportRpc({
      eventId: 9,
      rows: [protoRow(), protoRow({ rowNumber: 5, state: 1 })],
    });

    expect(preview).toHaveBeenCalledWith({
      eventId: 9,
      rows: [
        expect.objectContaining({
          rowNumber: 4,
          state: undefined,
          categoryName: 'Sistemas',
          nrc: '1001',
          tutorEmails: ['profe@uni.edu'],
          participants: [
            expect.objectContaining({
              email: 'ana@uni.edu',
              studentCode: '1',
              slot: 1,
            }),
          ],
        }),
        expect.objectContaining({ rowNumber: 5, state: 'UNDER_REVIEW' }),
      ],
    });
    expect(res.rows).toEqual([
      {
        rowNumber: 4,
        outcome: ProjectImportOutcome.PROJECT_IMPORT_SKIP,
        message: 'Ya existe en el evento (Id 40); se omite.',
        projectName: 'Robot',
        categoryName: 'Sistemas',
        state: 2,
        participants: [
          {
            email: 'ana@uni.edu',
            status: ProjectImportParticipantStatus.PROJECT_IMPORT_HAS_ACCOUNT,
          },
        ],
        projectId: 40,
        failedEffects: [],
      },
      expect.objectContaining({
        outcome: ProjectImportOutcome.PROJECT_IMPORT_ERROR,
        categoryName: undefined,
        projectId: undefined,
      }),
    ]);
    expect(res).toMatchObject({
      totals: { rows: 2, skipped: 1, errors: 1 },
      canConfirm: false,
    });
  });

  it('ExecuteProjectImport passes the acting user and the file name and answers the created rows', async () => {
    const execute = jest.fn().mockResolvedValue({
      rows: [createdRow],
      totals: {
        rows: 1,
        created: 1,
        skipped: 0,
        errors: 0,
        emailsSent: 0,
        failedEffects: 1,
      },
    });

    const res = await build({ execute }).executeProjectImportRpc({
      eventId: 9,
      rows: [protoRow({ state: 1 })],
      actingUserId: 5,
      fileName: 'feria.xlsx',
    });

    expect(execute).toHaveBeenCalledWith({
      eventId: 9,
      rows: [expect.objectContaining({ rowNumber: 4, state: 'UNDER_REVIEW' })],
      actingUserId: 5,
      fileName: 'feria.xlsx',
    });
    expect(res.rows[0]).toMatchObject({
      outcome: ProjectImportOutcome.PROJECT_IMPORT_CREATED,
      state: 1,
      projectId: 40,
      participants: [
        {
          email: 'ana@uni.edu',
          status: ProjectImportParticipantStatus.PROJECT_IMPORT_NO_ACCOUNT,
        },
      ],
      failedEffects: ['INVITATION'],
    });
    expect(res.totals).toEqual({
      rows: 1,
      created: 1,
      skipped: 0,
      errors: 0,
      emailsSent: 0,
      failedEffects: 1,
    });
  });

  it('ExecuteProjectImport lets the refusal of a preview that cannot be confirmed through', async () => {
    const refusal = new PreconditionError(
      'No se puede ejecutar la importación.',
    );
    const execute = jest.fn().mockRejectedValue(refusal);

    await expect(
      build({ execute }).executeProjectImportRpc({
        eventId: 9,
        rows: [protoRow()],
        actingUserId: 5,
        fileName: 'feria.xlsx',
      }),
    ).rejects.toBe(refusal);
  });

  it('GetProjectImportTemplate answers the event name, categories and whether the NRC is required', async () => {
    const template = jest.fn().mockResolvedValue({
      eventName: 'Feria',
      categoryNames: ['Arquitectura', 'Sistemas'],
      requiresCourse: true,
    });

    const res = await build({ template }).getProjectImportTemplateRpc({
      eventId: 9,
    });

    expect(template).toHaveBeenCalledWith({ eventId: 9 });
    expect(res).toEqual({
      eventName: 'Feria',
      categoryNames: ['Arquitectura', 'Sistemas'],
      requiresCourse: true,
    });
  });
});
