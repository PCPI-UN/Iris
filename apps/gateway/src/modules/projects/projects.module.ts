import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import {
  PROJECTS_SERVICE_NAME,
  protobufPackage as projectProtobufPackage,
} from '@app/common/generated/project';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AzureBlobUploadService } from './azure-blob-upload.service';
import { SignBlobUrlsInterceptor } from './sign-blob-urls.interceptor';
import { FetchProjectJurorsUseCase } from './use-cases/fetch-project-jurors.use-case';
import { FetchUserProfilesUseCase } from './use-cases/fetch-user-profiles.use-case';
import { EnrichProjectsWithJurorsUseCase } from './use-cases/enrich-projects-with-jurors.use-case';
import { ValidateJurorHasNotEvaluatedUseCase } from './use-cases/validate-juror-has-not-evaluated.use-case';
import { RemoveJurorFromProjectUseCase } from './use-cases/remove-juror-from-project.use-case';
import { UpdateProjectCodeUseCase } from './use-cases/update-project-code.use-case';
import { JurorImportsController } from './juror-imports/juror-imports.controller';
import { JurorImportsService } from './juror-imports/juror-imports.service';

import {
  EVENT_SERVICE_NAME,
  protobufPackage as eventProtobufPackage,
} from '@app/common/generated/event';

import {
  EVALUATION_SERVICE_NAME,
  protobufPackage as evaluationProtobufPackage,
} from '@app/common/generated/evaluation';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: PROJECTS_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: projectProtobufPackage,
            loader: {
              keepCase: true,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
              arrays: true,
            },
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/project.proto',
            ),
            url: configService.get<string>('PROJECT_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
      // 👇 NUEVO: client del event-service
      {
        name: EVENT_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: eventProtobufPackage,
            loader: {
              keepCase: true,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
              arrays: true,
            },
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/event.proto',
            ),
            url: configService.get<string>('EVENT_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: EVALUATION_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: evaluationProtobufPackage,
            loader: {
              keepCase: true,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
              arrays: true,
            },
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/evaluation.proto',
            ),
            url: configService.get<string>('EVALUATION_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ProjectsController, JurorImportsController],
  providers: [
    ProjectsService,
    AzureBlobUploadService,
    FetchProjectJurorsUseCase,
    FetchUserProfilesUseCase,
    EnrichProjectsWithJurorsUseCase,
    ValidateJurorHasNotEvaluatedUseCase,
    RemoveJurorFromProjectUseCase,
    UpdateProjectCodeUseCase,
    JurorImportsService,
    { provide: APP_INTERCEPTOR, useClass: SignBlobUrlsInterceptor },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
