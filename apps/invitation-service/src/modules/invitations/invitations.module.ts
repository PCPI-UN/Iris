import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AUTH_SERVICE_NAME, protobufPackage } from '@app/common/generated/auth';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import {
  NOTIFICATION_SERVICE_NAME,
  protobufPackage as notificationProtobufPackage,
} from '@app/common/generated/notification';
import {
  EVENT_SERVICE_NAME,
  protobufPackage as eventProtobufPackage,
} from '@app/common/generated/event';
import {
  PROJECTS_SERVICE_NAME,
  protobufPackage as projectProtobufPackage,
} from '@app/common/generated/project';



// Application
import { CreateInvitationUseCase } from './application/use-cases/create-invitation.use-case';
import { GetInvitationByTokenUseCase } from './application/use-cases/get-invitation-by-token.use-case';
import { AcceptInvitationUseCase } from './application/use-cases/accept-invitation.use-case';
import { RejectInvitationUseCase } from './application/use-cases/reject-invitation.use-case';
import { FindPendingByEmailUseCase } from './application/use-cases/find-pending-by-email.use-case';
import { ResendInvitationUseCase } from './application/use-cases/resend-invitation.use-case';
import { ListUserInvitationsUseCase } from './application/use-cases/list-user-invitations.use-case';
import { ListEventInvitationsUseCase } from './application/use-cases/list-event-invitations.use-case';
import { AuthorizeInvitationUseCase } from './application/use-cases/authorize-invitation.use-case';

// Domain
import { InvitationRepositoryPort } from './domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from './domain/repositories/invitation-role.repository.port';

// Infrastructure
import { PrismaInvitationRepository } from './infrastructure/prisma/prisma-invitation.repository';
import { PrismaInvitationRoleRepository } from './infrastructure/prisma/prisma-invitation-role.repository';
import { NotificationGrpcClient } from '../../common/grpc-client/notification.grpc-client';
import { NotificationServiceAdapter } from './infrastructure/adapters/notification-service.adapter';
import { NotificationServicePort } from './infrastructure/ports/notification-service.port';
import { AuthServiceAdapter } from './infrastructure/adapters/auth-service.adapter';
import { AuthServicePort } from './infrastructure/ports/auth-service.port';
import { EventServiceAdapter } from './infrastructure/adapters/event-service.adapter';
import { EventServicePort } from './infrastructure/ports/event-service.port';
import { ProjectServiceAdapter } from './infrastructure/adapters/project-service.adapter';
import { ProjectServicePort } from './infrastructure/ports/project-service.port';

// Interface
import { InvitationController } from './interface/grpc/invitation.controller';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: protobufPackage,
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/auth.proto',
            ),
            url: configService.get<string>('AUTH_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: NOTIFICATION_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: notificationProtobufPackage,
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/notification.proto',
            ),
            url: configService.get<string>('NOTIFICATION_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
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
        name: PROJECTS_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: projectProtobufPackage,
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/project.proto',
            ),
            url: configService.get<string>('PROJECT_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [InvitationController],
  providers: [
    // Use Cases
    CreateInvitationUseCase,
    GetInvitationByTokenUseCase,
    AcceptInvitationUseCase,
    RejectInvitationUseCase,
    FindPendingByEmailUseCase,
    ListEventInvitationsUseCase,
    ResendInvitationUseCase,
    ListUserInvitationsUseCase,
    AuthorizeInvitationUseCase,

    // Repository Implementations
    {
      provide: InvitationRepositoryPort,
      useClass: PrismaInvitationRepository,
    },
    {
      provide: InvitationRoleRepositoryPort,
      useClass: PrismaInvitationRoleRepository,
    },

    // Notification Service Integration
    NotificationGrpcClient,
    {
      provide: NotificationServicePort,
      useClass: NotificationServiceAdapter,
    },

    // Auth Service Integration
    {
      provide: AuthServicePort,
      useClass: AuthServiceAdapter,
    },

    // Event Service Integration
    {
      provide: EventServicePort,
      useClass: EventServiceAdapter,
    },

    // Project Service Integration
    {
      provide: ProjectServicePort,
      useClass: ProjectServiceAdapter,
    },
  ],
  exports: [
    CreateInvitationUseCase,
    GetInvitationByTokenUseCase,
    AcceptInvitationUseCase,
    RejectInvitationUseCase,
    FindPendingByEmailUseCase,
    ListEventInvitationsUseCase,
    ResendInvitationUseCase,
    ListUserInvitationsUseCase,
    AuthorizeInvitationUseCase,
  ],
})
export class InvitationsModule { }