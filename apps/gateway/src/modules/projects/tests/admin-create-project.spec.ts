import { BadRequestException, ConflictException } from '@nestjs/common';
import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';
import { ProjectsController } from '../projects.controller';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';
import { AdminCreateProjectMultipartDto } from '../dto/admin-create-project-multipart.dto';

describe('ProjectsService.adminCreateProject (POST /projects/admin)', () => {
  const body = (
    change: Partial<AdminCreateProjectMultipartDto> = {},
  ): AdminCreateProjectMultipartDto => ({
    eventId: '41',
    courseId: '9',
    nrc: '1001',
    name: 'Robot',
    participants: JSON.stringify([
      {
        firstName: 'Ana',
        email: 'ana@uni.edu',
        studentCode: '1',
        semester: '6',
        career: 'x',
      },
    ]),
    documents: JSON.stringify([{ type: 'POSTER' }]),
    ...change,
  });
  const poster = { originalname: 'poster.png', size: 1000 };

  const created = {
    project: { id: 812, name: 'Robot', state: 2, eventId: 41, courseId: 9 },
    participants: [{ email: 'ana@uni.edu', status: 'JOINED' }],
    tutors: [],
    failedEffects: [],
    warning: '',
  };

  const setup = (
    options: { response?: unknown; uploadFails?: boolean } = {},
  ) => {
    const grpc = {
      adminCreateProject: jest.fn(() => of(options.response ?? created)),
      addProjectDocumentFromUrl: jest.fn(() => of({})),
    };
    const blobs = {
      uploadFile: jest.fn(() =>
        options.uploadFails
          ? Promise.reject(new Error('Azure down'))
          : Promise.resolve({ blobName: 'abc-poster.png' }),
      ),
    };
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    Object.assign(service, {
      projectsService: grpc,
      azureBlobUploadService: blobs,
      logger: { log: jest.fn(), error: jest.fn() },
    });
    return { service, grpc, blobs };
  };

  it('creates the project, uploads and attaches its files and answers 201 with the created project', async () => {
    const { service, grpc } = setup();

    const res = await service.adminCreateProject(
      body({ state: 'UNDER_REVIEW' }),
      [poster],
      5,
    );

    expect(grpc.adminCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 41,
        courseId: 9,
        state: 1,
        actingUserId: 5,
        originKind: 'ADMIN_FORM',
        participants: [expect.objectContaining({ email: 'ana@uni.edu' })],
      }),
    );
    expect(grpc.addProjectDocumentFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 812, url: 'abc-poster.png' }),
    );
    expect(res).toEqual({
      project: {
        id: 812,
        name: 'Robot',
        state: 'APPROVED',
        eventId: 41,
        courseId: 9,
      },
      participants: [{ email: 'ana@uni.edu', status: 'JOINED' }],
      tutors: [],
      failedEffects: [],
      warning: null,
    });
  });

  it('leaves the state unset when the body has none (APPROVED in project-service)', async () => {
    const { service, grpc } = setup();

    await service.adminCreateProject(body({ documents: undefined }), [], 5);

    expect(grpc.adminCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ state: undefined }),
    );
  });

  it('answers the tutors without the keys the gRPC client adds for optional fields', async () => {
    const tutor = {
      userId: 5,
      firstName: 'Luz',
      lastName: 'Rey',
      pending: false,
    };
    const { service } = setup({
      response: {
        ...created,
        tutors: [{ ...tutor, _userId: 'userId', _lastName: 'lastName' }],
      },
    });

    const result = await service.adminCreateProject(
      body({ documents: undefined }),
      [],
      5,
    );

    expect(result.tutors).toEqual([{ ...tutor, email: undefined }]);
  });

  it('keeps the created project when the upload fails and reports DOCUMENTS', async () => {
    const { service, grpc } = setup({
      uploadFails: true,
      response: {
        ...created,
        failedEffects: ['NOTIFICATION'],
        warning:
          'El proyecto se creó, pero no se completaron todos los pasos posteriores: correos.',
      },
    });

    const res = await service.adminCreateProject(body(), [poster], 5);

    expect(grpc.addProjectDocumentFromUrl).not.toHaveBeenCalled();
    expect(res.failedEffects).toEqual(['DOCUMENTS', 'NOTIFICATION']);
    expect(res.warning).toContain('documentos');
    expect(res.warning).toContain('correos');
  });

  it.each([
    [
      'PARTICIPANT_IN_OTHER_PROJECT',
      ['ana@uni.edu'],
      { emails: ['ana@uni.edu'] },
    ],
    ['PROJECT_NAME_TAKEN', [], { name: 'Robot' }],
    ['EVENT_RESULTS_PUBLISHED', [], {}],
  ])(
    'answers 409 %s with its details and uploads nothing',
    async (code, emails, details) => {
      const { service, blobs } = setup({
        response: {
          participants: [],
          tutors: [],
          rejected: { code, message: 'No se creó', emails },
          failedEffects: [],
          warning: '',
        },
      });

      const error = await service
        .adminCreateProject(body(), [poster], 5)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        message: 'No se creó',
        code,
        details,
      });
      expect(blobs.uploadFile).not.toHaveBeenCalled();
    },
  );

  it('checks the files before creating anything', async () => {
    const { service, grpc } = setup();

    await expect(
      service.adminCreateProject(body(), [poster, poster], 5),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(grpc.adminCreateProject).not.toHaveBeenCalled();
  });

  it('requires manage:projects (403 without it)', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ProjectsController.prototype,
      'adminCreateProject',
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'manage:projects',
    ]);
  });
});
