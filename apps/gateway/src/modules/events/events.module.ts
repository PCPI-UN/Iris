import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { MeEventsController } from './me-events.controller';
import { EventService } from './events.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ProjectsModule } from '../projects/projects.module';
import {
  EVENT_SERVICE_NAME,
  protobufPackage as eventProtobufPackage,
} from '@app/common/generated/event';
import {
  AUTH_SERVICE_NAME,
  protobufPackage as authProtobufPackage,
} from '@app/common/generated/auth';
import {
  INVITATION_SERVICE_NAME,
  protobufPackage as invitationProtobufPackage,
} from '@app/common/generated/invitation';
import {
  EVALUATION_SERVICE_NAME,
  protobufPackage as evaluationProtobufPackage,
} from '@app/common/generated/evaluation';
import { FetchConfirmedJurorMembersUseCase } from './use-cases/fetch-confirmed-juror-members.use-case';
import { FetchJurorUsersUseCase } from './use-cases/fetch-juror-users.use-case';
import { FetchJurorAssignedProjectsUseCase } from './use-cases/fetch-juror-assigned-projects.use-case';
import { ListConfirmedJurorsByEventUseCase } from './use-cases/list-confirmed-jurors-by-event.use-case';

/**
 * Events module composition.
 *
 * Ranking report support requires:
 * - event-service for event metadata and ranking configuration.
 * - evaluation-service for project stats and tie-break records.
 * - project-service (via ProjectsModule) for project + participant data.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: EVENT_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: eventProtobufPackage,
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
        name: AUTH_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: authProtobufPackage,
            protoPath: join(process.cwd(), 'libs/common/src/protos/auth.proto'),
            url: configService.get<string>('AUTH_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: INVITATION_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: invitationProtobufPackage,
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/invitation.proto',
            ),
            url: configService.get<string>('INVITATION_SERVICE_URL'),
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
    ProjectsModule,
  ],
  controllers: [EventsController, MeEventsController],
  providers: [
    EventService,
    FetchConfirmedJurorMembersUseCase,
    FetchJurorUsersUseCase,
    FetchJurorAssignedProjectsUseCase,
    ListConfirmedJurorsByEventUseCase,
  ],
  exports: [EventService],
})
export class EventsModule {}
