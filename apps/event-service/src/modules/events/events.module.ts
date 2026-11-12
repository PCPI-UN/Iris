import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@common/prisma/prisma.service';
import { EventsController } from '@events/interface/grpc/controller';
import { EventMemberController } from '@events/interface/grpc/event-members.controller';
import { EventCatalogController } from '@events/interface/grpc/event-catalog.controller';
import { PrismaEventRepository } from '@events/infrastructure/prisma/prisma-event.repository';
import { PrismaEventMemberRepository } from '@events/infrastructure/prisma/prisma-event-member.repository';
import { CreateEventUC } from '@events/application/use-cases/create-event.uc';
import { UpdateEventUC } from '@events/application/use-cases/update-event.uc';
import { GetEventUC } from '@events/application/use-cases/get-event.uc';
import { ListEventsUC } from '@events/application/use-cases/list-events.uc';
import { DeleteEventUC } from '@events/application/use-cases/delete-event.uc';
import { ListMyEventsUseCase } from '@events/application/use-cases/list-my-events.use-case';
import { GetEventStatusesUC } from '@events/application/use-cases/get-event-statuses.uc';
import { CreateEventMemberUseCase } from '@events/application/use-cases/event-members/create-event-member.use-case';
import { DeleteEventMemberUseCase } from '@events/application/use-cases/event-members/delete-event-member.use-case';
import { FindEventMemberByUserAndEventUseCase } from '@events/application/use-cases/event-members/get-event-member.use-case';
import { ListEventMembersUseCase } from '@events/application/use-cases/event-members/list-event-members.use-case';
import { GetJurorMembershipUseCase } from '@events/application/use-cases/event-members/get-juror-membership.use-case';
import { AuthClientPort } from '@events/infrastructure/ports/auth-client.port';
import { GrpcAuthClientAdapter } from '@events/infrastructure/adapters/grpc-auth-client.adapter';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { EventMemberRepository } from '@events/domain/repositories/event-member.repository';
import { AUTH_SERVICE_NAME, protobufPackage } from '@app/common/generated/auth';
import { EventCatalogService } from '@events/application/event-catalog.service';
import { GetEventDashboardStatsUC } from '@events/application/use-cases/get-dashboard-stats.uc';
import { RankingEventController } from '@events/interface/grpc/ranking-event.controller';
import { PrismaRankingEventRepository } from '@events/infrastructure/prisma/prisma-ranking-event.repository';
import { RankingEventRepository } from '@events/domain/repositories/ranking-event.repository';
import { CreateRankingEventUseCase } from '@events/application/use-cases/ranking-event/create-ranking-event.use-case';
import { UpdateRankingEventUseCase } from '@events/application/use-cases/ranking-event/update-ranking-event.use-case';
import { GetRankingEventUseCase } from '@events/application/use-cases/ranking-event/get-ranking-event.use-case';
import { GetRankingEventByEventIdUseCase } from '@events/application/use-cases/ranking-event/get-ranking-event-by-event-id.use-case';
import { DeleteRankingEventUseCase } from '@events/application/use-cases/ranking-event/delete-ranking-event.use-case';
import { GetEventsForARUseCase } from './application/use-cases/get-events-for-ar.use-case';
import { ListEventsByIdsUC } from '@events/application/use-cases/list-events-by-ids.uc';
import { ListAwardsByProjectsUC } from '@events/application/use-cases/list-awards-by-projects.uc';
import { AwardWinnerRepository } from '@events/domain/repositories/award-winner.repository';
import { PrismaAwardWinnerRepository } from '@events/infrastructure/prisma/prisma-award-winner.repository';
import { ListCategoriesByIdsUC } from '@events/application/use-cases/list-categories-by-ids.uc';
import { CategoryRepository } from '@events/domain/repositories/category.repository';
import { PrismaCategoryRepository } from '@events/infrastructure/prisma/prisma-category.repository';


@Module({
  imports: [
    ClientsModule.register([
      {
        name: AUTH_SERVICE_NAME,
        transport: Transport.GRPC,
        options: {
          package: protobufPackage,
          protoPath: 'libs/common/src/protos/auth.proto',
          url: process.env.AUTH_SERVICE_URL || 'auth-service:50051',
        },
      },
    ]),
  ],
  controllers: [EventsController, EventMemberController, EventCatalogController, RankingEventController],
  providers: [
    PrismaService,
    EventCatalogService,
    {
      provide: EventRepository,
      useClass: PrismaEventRepository,
    },
    {
      provide: EventMemberRepository,
      useClass: PrismaEventMemberRepository,
    },
    {
      provide: AuthClientPort,
      useClass: GrpcAuthClientAdapter,
    },
    // Event use cases
    CreateEventUC,
    UpdateEventUC,
    GetEventUC,
    ListEventsUC,
    DeleteEventUC,
    ListMyEventsUseCase,
    GetEventStatusesUC,
    GetEventDashboardStatsUC,
    GetEventsForARUseCase,
    ListEventsByIdsUC,
    // Award winners (student dashboard)
    {
      provide: AwardWinnerRepository,
      useClass: PrismaAwardWinnerRepository,
    },
    ListAwardsByProjectsUC,
    {
      provide: CategoryRepository,
      useClass: PrismaCategoryRepository,
    },
    ListCategoriesByIdsUC,
    // Ranking event
    {
      provide: RankingEventRepository,
      useClass: PrismaRankingEventRepository,
    },
    CreateRankingEventUseCase,
    UpdateRankingEventUseCase,
    GetRankingEventUseCase,
    GetRankingEventByEventIdUseCase,
    DeleteRankingEventUseCase,
    // Event-member use cases
    CreateEventMemberUseCase,
    DeleteEventMemberUseCase,
    FindEventMemberByUserAndEventUseCase,
    ListEventMembersUseCase,
    GetJurorMembershipUseCase,
  ],
  exports: [EventRepository, EventMemberRepository, EventCatalogService],
})
export class EventsModule {}
