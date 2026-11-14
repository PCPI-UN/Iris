import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EVENT_SERVICE_NAME, GetEventStatusesRequest } from '@app/common/generated/event';
import { CreateEventUC } from '@events/application/use-cases/create-event.uc';
import { UpdateEventUC } from '@events/application/use-cases/update-event.uc';
import { GetEventUC } from '@events/application/use-cases/get-event.uc';
import { DeleteEventUC } from '@events/application/use-cases/delete-event.uc';
import { ListMyEventsUseCase } from '@events/application/use-cases/list-my-events.use-case';
import { ListEventsUC } from '@events/application/use-cases/list-events.uc';
import { GetEventStatusesUC } from '@events/application/use-cases/get-event-statuses.uc';
import { EventMapper } from '@events/application/mappers/event.mapper';
import { CreateEventDTO } from '@events/application/dto/create-event.dto';
import { UpdateEventDTO } from '@events/application/dto/update-event.dto';
import { GetEventDTO } from '@events/application/dto/get-event.dto';
import { DeleteEventDTO } from '@events/application/dto/delete-event.dto';
import { ListMyEventsDto } from '@events/application/dto/list-my-events.dto';
import { ListEventsDTO } from '@events/application/dto/list-events.dto';
import { GetEventDashboardStatsUC } from '../../application/use-cases/get-dashboard-stats.uc';
import { GetEventsForARUseCase } from '../../application/use-cases/get-events-for-ar.use-case';
import { ListEventsByIdsUC } from '@events/application/use-cases/list-events-by-ids.uc';
import { ListEventsByIdsDTO } from '@events/application/dto/list-events-by-ids.dto';

@Controller()
export class EventsController {
  constructor(
    private readonly createUC: CreateEventUC,
    private readonly updateUC: UpdateEventUC,
    private readonly getUC: GetEventUC,
    private readonly deleteUC: DeleteEventUC,
    private readonly listMyEventsUC: ListMyEventsUseCase,
    private readonly listEventsUC: ListEventsUC,
    private readonly getEventStatusesUC: GetEventStatusesUC,
    private readonly getDashboardStatsUC: GetEventDashboardStatsUC,
    private readonly getEventsForARUC: GetEventsForARUseCase,
    private readonly listEventsByIdsUC: ListEventsByIdsUC,
  ) { }

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateEvent')
  async createEvent(request: CreateEventDTO) {
    const event = await this.createUC.execute(request);
    return EventMapper.toCreateEventResponse(event);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'UpdateEvent')
  async updateEvent(request: UpdateEventDTO) {
    const event = await this.updateUC.execute(request);
    return EventMapper.toUpdateEventResponse(event);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetEvent')
  async getEvent(request: GetEventDTO) {
    const event = await this.getUC.execute(request);
    return EventMapper.toGetEventResponse(event);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'DeleteEvent')
  async deleteEvent(request: DeleteEventDTO) {
    await this.deleteUC.execute(request);
    return EventMapper.toDeleteEventResponse();
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListMyEvents')
  async listMyEvents(request: ListMyEventsDto) {
    const result = await this.listMyEventsUC.execute(request);
    return EventMapper.toListMyEventsResponse(result);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListEvents')
  async listEvents(request: ListEventsDTO) {
    const result = await this.listEventsUC.execute(request);
    return EventMapper.toListEventsResponse(result);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetEventStatuses')
  async getEventStatuses(request: GetEventStatusesRequest) {
    return this.getEventStatusesUC.execute();
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetDashboardStats')
  async getDashboardStats() {
    return this.getDashboardStatsUC.execute();
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetEventsForAR')
  async getEventsForAR(_request: any) {
    const events = await this.getEventsForARUC.execute();
    return EventMapper.toGetEventsForARResponse(events);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListEventsByIds')
  async listEventsByIds(request: ListEventsByIdsDTO) {
    const events = await this.listEventsByIdsUC.execute(request);
    return EventMapper.toListEventsByIdsResponse(events);
  }
}
