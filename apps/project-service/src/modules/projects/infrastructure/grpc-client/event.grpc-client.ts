// apps/project-service/src/infrastructure/grpc/event.grpc-client.ts
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';

interface EventServiceGrpc {
  getEvent(data: { id: number }): Observable<any>;
  getCourse(data: { id: number }): Observable<any>;
  getJurorMembership(data: { userId: number; eventId: number }): Observable<any>;
  listEventsByIds(data: { ids: number[] }): Observable<any>;
  listAwardsByProjects(data: { projectIds: number[] }): Observable<any>;
  // si luego quieres: listCoursesByEvent ...
}

import { EVENT_SERVICE_NAME } from '@app/common/generated/event';

@Injectable()
export class EventGrpcClient implements OnModuleInit {
  private svc: EventServiceGrpc;

  constructor(
    @Inject(EVENT_SERVICE_NAME) private readonly client: ClientGrpc,
  ) { }

  onModuleInit() {
    // el nombre debe ser EXACTO al del service en tu proto:
    // service EventService { ... }
    this.svc = this.client.getService<EventServiceGrpc>('EventService');
  }

  async getEvent(id: number) {
    return firstValueFrom(this.svc.getEvent({ id }));
  }

  async getCourse(id: number) {
    return firstValueFrom(this.svc.getCourse({ id }));
  }

  async getJurorMembership(userId: number, eventId: number) {
    return firstValueFrom(this.svc.getJurorMembership({ userId, eventId }));
  }

  async listEventsByIds(ids: number[]) {
    return firstValueFrom(this.svc.listEventsByIds({ ids }));
  }

  async listAwardsByProjects(projectIds: number[]) {
    return firstValueFrom(this.svc.listAwardsByProjects({ projectIds }));
  }
}
