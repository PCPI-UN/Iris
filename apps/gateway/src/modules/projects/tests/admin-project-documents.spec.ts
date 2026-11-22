import {
  ArgumentsHost,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { lastValueFrom, of, throwError } from 'rxjs';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ProjectsService } from '../projects.service';
import { ProjectsController } from '../projects.controller';
import {
  AdminChangeProjectDocumentStateDto,
  AdminReplaceProjectDocumentDto,
} from '../dto/admin-project-document.dto';
import { DocumentStatusFilter } from '../dto/update-project-document.dto';
import { DocumentStatus } from '@app/common/generated/project';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';
import { GrpcExceptionFilter } from '../../../common/filters/grpc-exception.filter';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { ROUTE_POLICY } from '../../../common/authorization/route-policy';
import { AppUser } from '../../auth/types/app-user.type';
import { SignBlobUrlsInterceptor } from '../sign-blob-urls.interceptor';
import { AzureBlobUploadService } from '../azure-blob-upload.service';

const handlerOf = (name: keyof ProjectsController) =>
  Object.getOwnPropertyDescriptor(ProjectsController.prototype, name)
    ?.value as object;

/** Status the exception filter answers for an error of the service */
const httpStatus = (error: unknown): number | undefined => {
  let status: number | undefined;
  const response = {
    status: (code: number) => {
      status = code;
      return { json: () => undefined };
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) };
  new GrpcExceptionFilter().catch(error, host as unknown as ArgumentsHost);
  return status;
};

const NO_CONTEXT = {} as ExecutionContext;

const poster = (url: string, state = DocumentStatus.ACTIVE) => ({
  id: 7,
  projectId: 4,
  url,
  type: 2,
  state,
  createdAt: '',
  updatedAt: '',
});

const file = (size = 1024) =>
  ({
    originalname: 'poster-nuevo.pdf',
    mimetype: 'application/pdf',
    size,
    buffer: Buffer.from('x'),
  }) as Express.Multer.File;

const buildService = (documents = [poster('viejo.pdf')]) => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const grpc = {
    listProjectDocuments: jest.fn(() => of({ items: documents })),
    adminReplaceProjectDocument: jest.fn(() =>
      of({ document: poster('1800-poster-nuevo.pdf') }),
    ),
    adminChangeProjectDocumentState: jest.fn(() =>
      of({ document: poster('viejo.pdf', DocumentStatus.INACTIVE) }),
    ),
  };
  const blob = {
    uploadFile: jest
      .fn()
      .mockResolvedValue({ blobName: '1800-poster-nuevo.pdf' }),
  };
  Object.assign(service, {
    projectsService: grpc,
    azureBlobUploadService: blob,
  });
  return { service, grpc, blob };
};

const ADMIN_DOCUMENT_HANDLERS = [
  'adminListProjectDocuments',
  'adminReplaceProjectDocument',
  'adminChangeProjectDocumentState',
] as const;

describe('Administrative document endpoints', () => {
  it('require manage:projects and are in the route policy', () => {
    for (const name of ADMIN_DOCUMENT_HANDLERS) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf(name))).toEqual([
        'manage:projects',
      ]);
    }
    for (const key of [
      'GET /projects/:id/admin/documents',
      'PUT /projects/:id/admin/documents/:documentId',
      'PATCH /projects/:id/admin/documents/:documentId/state',
    ]) {
      expect(ROUTE_POLICY[key]).toEqual({ permission: ['manage:projects'] });
    }
  });

  describe('permissions', () => {
    const guard = new PermissionsGuard(new Reflector());
    const contextFor = (
      name: (typeof ADMIN_DOCUMENT_HANDLERS)[number],
      user: Partial<AppUser>,
    ) =>
      ({
        getHandler: () => handlerOf(name),
        getClass: () => ProjectsController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;

    it.each(ADMIN_DOCUMENT_HANDLERS)(
      '%s answers 403 without manage:projects',
      (name) => {
        expect(() =>
          guard.canActivate(
            contextFor(name, {
              platformPermissions: ['manage:events'],
              platformRoles: [],
            }),
          ),
        ).toThrow(ForbiddenException);
      },
    );

    it.each(ADMIN_DOCUMENT_HANDLERS)(
      '%s lets in a user with manage:projects',
      (name) => {
        expect(
          guard.canActivate(
            contextFor(name, {
              platformPermissions: ['manage:projects'],
              platformRoles: [],
            }),
          ),
        ).toBe(true);
      },
    );
  });

  describe('PUT /projects/:id/admin/documents/:documentId', () => {
    it('uploads the file and sends its blob name (not a signed URL) with the reason', async () => {
      const { service, grpc, blob } = buildService();
      const upload = file();

      const result = await service.adminReplaceProjectDocument(
        4,
        7,
        upload,
        plainToInstance(AdminReplaceProjectDocumentDto, {
          reason: 'Era de otro proyecto',
        }),
        12,
      );

      expect(grpc.listProjectDocuments).toHaveBeenCalledWith({
        projectId: 4,
        includeInactive: true,
      });
      expect(blob.uploadFile).toHaveBeenCalledWith(upload);
      expect(grpc.adminReplaceProjectDocument).toHaveBeenCalledWith({
        projectId: 4,
        documentId: 7,
        actingUserId: 12,
        url: '1800-poster-nuevo.pdf',
        reason: 'Era de otro proyecto',
      });
      expect(result).toMatchObject({ id: 7, url: '1800-poster-nuevo.pdf' });
    });

    it('answers with a signed URL of the new file, so opening it shows the new poster', async () => {
      const { service } = buildService();
      const blobService = {
        signStoredUrl: jest.fn((url: string) => `https://acc.blob/${url}?sig`),
      } as unknown as AzureBlobUploadService;
      const document = await service.adminReplaceProjectDocument(
        4,
        7,
        file(),
        {},
        12,
      );

      const signed = (await lastValueFrom(
        new SignBlobUrlsInterceptor(blobService).intercept(NO_CONTEXT, {
          handle: () => of(document),
        }),
      )) as { url: string };

      expect(signed.url).toBe('https://acc.blob/1800-poster-nuevo.pdf?sig');
    });

    it('answers 404 for a document of another project without uploading anything', async () => {
      const { service, grpc, blob } = buildService([]);

      const error = await service
        .adminReplaceProjectDocument(4, 7, file(), {}, 12)
        .catch((e: unknown) => e);

      expect(httpStatus(error)).toBe(404);
      expect(blob.uploadFile).not.toHaveBeenCalled();
      expect(grpc.adminReplaceProjectDocument).not.toHaveBeenCalled();
    });

    it('answers 400 without a file or with a file over 5 MB, before any call', async () => {
      const { service, grpc, blob } = buildService();

      for (const upload of [undefined, file(5 * 1024 * 1024 + 1)]) {
        const error = await service
          .adminReplaceProjectDocument(4, 7, upload, {}, 12)
          .catch((e: unknown) => e);
        expect(httpStatus(error)).toBe(400);
      }
      expect(grpc.listProjectDocuments).not.toHaveBeenCalled();
      expect(blob.uploadFile).not.toHaveBeenCalled();
    });

    it('passes on the 404 of project-service (document moved to another project meanwhile)', async () => {
      const { service, grpc } = buildService();
      grpc.adminReplaceProjectDocument.mockReturnValue(
        throwError(() => ({
          code: GrpcStatus.NOT_FOUND,
          details: 'No se encontró el documento 7 en este proyecto',
        })),
      );

      const error = await service
        .adminReplaceProjectDocument(4, 7, file(), {}, 12)
        .catch((e: unknown) => e);

      expect(httpStatus(error)).toBe(404);
    });
  });

  describe('PATCH /projects/:id/admin/documents/:documentId/state', () => {
    it('sends the state as proto with the reason', async () => {
      const { service, grpc } = buildService();

      const result = await service.adminChangeProjectDocumentState(
        4,
        7,
        plainToInstance(AdminChangeProjectDocumentStateDto, {
          state: 'INACTIVE',
          reason: ' Datos personales ',
        }),
        12,
      );

      expect(grpc.adminChangeProjectDocumentState).toHaveBeenCalledWith({
        projectId: 4,
        documentId: 7,
        actingUserId: 12,
        state: DocumentStatus.INACTIVE,
        reason: 'Datos personales',
      });
      expect(result).toMatchObject({ state: DocumentStatus.INACTIVE });
    });

    it('validates the state in Spanish', async () => {
      const errors = await validate(
        plainToInstance(AdminChangeProjectDocumentStateDto, {
          state: 'DELETED',
        }),
      );
      expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toEqual(
        ['El estado del documento debe ser ACTIVE o INACTIVE'],
      );
      expect(
        await validate(
          plainToInstance(AdminChangeProjectDocumentStateDto, {
            state: DocumentStatusFilter.ACTIVE,
          }),
        ),
      ).toEqual([]);
    });

    it('passes on the 404 for a document of another project', async () => {
      const { service, grpc } = buildService();
      grpc.adminChangeProjectDocumentState.mockReturnValue(
        throwError(() => ({
          code: GrpcStatus.NOT_FOUND,
          details: 'No se encontró el documento 7 en este proyecto',
        })),
      );

      const error = await service
        .adminChangeProjectDocumentState(
          4,
          7,
          plainToInstance(AdminChangeProjectDocumentStateDto, {
            state: 'INACTIVE',
          }),
          12,
        )
        .catch((e: unknown) => e);

      expect(httpStatus(error)).toBe(404);
    });
  });

  describe('GET /projects/:id/admin/documents', () => {
    it('lists the INACTIVE documents too', async () => {
      const inactive = poster('retirado.pdf', DocumentStatus.INACTIVE);
      const { service, grpc } = buildService([inactive]);

      expect(await service.adminListProjectDocuments(4)).toEqual([inactive]);
      expect(grpc.listProjectDocuments).toHaveBeenCalledWith({
        projectId: 4,
        includeInactive: true,
      });
    });
  });

  it('the change log keeps the stored file name: DOCUMENTS values are not signed', async () => {
    const blobService = {
      signStoredUrl: jest.fn((url: string) => `${url}?sig`),
    } as unknown as AzureBlobUploadService;
    const entry = {
      action: 'DOCUMENTS',
      before: {
        document: { id: 7, type: 'POSTER', url: 'viejo.pdf', state: 'ACTIVE' },
      },
      after: {
        document: { id: 7, type: 'POSTER', url: 'nuevo.pdf', state: 'ACTIVE' },
      },
    };

    const result: unknown = await lastValueFrom(
      new SignBlobUrlsInterceptor(blobService).intercept(NO_CONTEXT, {
        handle: () => of({ items: [structuredClone(entry)] }),
      }),
    );

    expect(result).toEqual({ items: [entry] });
  });

  it('the stable open link asks only for ACTIVE documents', async () => {
    const { service, grpc } = buildService([]);

    await service.getDocumentOpenUrl(4, 7).catch(() => undefined);

    expect(grpc.listProjectDocuments).toHaveBeenCalledWith({
      projectId: 4,
      includeInactive: false,
    });
  });
});
