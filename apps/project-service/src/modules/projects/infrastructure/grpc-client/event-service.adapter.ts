import { Injectable } from '@nestjs/common';
import {
  EventCategory,
  EventMembership,
  EventServicePort,
  JurorMembership,
} from '../../application/ports/event-service.port';
import { EventGrpcClient } from './event.grpc-client';
import { EventStatus } from '@app/common/generated/event';
import {
  ParticipationAward,
  ParticipationEvent,
} from '../../domain/student-participation-stats';

const CATEGORIES_PAGE_SIZE = 100;

@Injectable()
export class EventServiceAdapter implements EventServicePort {
  constructor(private readonly grpc: EventGrpcClient) {}

  async getEventMember(
    userId: number,
    eventId: number,
  ): Promise<EventMembership | null> {
    const res = await this.grpc.getEventMember(userId, eventId);
    // event-service answers roleId 0 (not an error) when there is no active membership
    if (!res || !res.roleId || !res.active) {
      return null;
    }
    return { userId: res.userId, eventId: res.eventId, roleId: res.roleId };
  }

  async listCategoriesByEvent(eventId: number): Promise<EventCategory[]> {
    const categories: EventCategory[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await this.grpc.listCategoriesByEvent(
        eventId,
        page,
        CATEGORIES_PAGE_SIZE,
      );
      for (const c of res?.categories ?? []) {
        categories.push({ id: c.id, name: c.name, active: c.active });
      }
      totalPages = res?.meta?.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages);
    return categories;
  }

  async getEventById(id: number) {
    const res = await this.grpc.getEvent(id); //res.event
    return res?.event ?? null;
  }

  async getCourseById(id: number) {
    const res = await this.grpc.getCourse(id);
    return res?.course ?? null;
  }

  async getJurorMembership(userId: number, eventId: number): Promise<JurorMembership | null> {
    const res = await this.grpc.getJurorMembership(userId, eventId);
    
    // If the response indicates the user is not a juror, return null
    if (!res || !res.isJuror) {
      return null;
    }

    // Return the juror membership information
    return {
      memberUserId: res.memberUserId,
      memberEventId: res.memberEventId,
      memberRoleId: res.memberRoleId,
    };
  }

  // This client has no loader options: proto3 defaults (false, 0, '') arrive undefined
  // and enums arrive as numbers, so every field is normalized here
  async listEventsByIds(ids: number[]): Promise<ParticipationEvent[]> {
    if (!ids.length) return [];
    const res = await this.grpc.listEventsByIds(ids);
    return (res?.events ?? []).map((e: any) => ({
      id: Number(e.id),
      name: e.name ?? '',
      startDate: e.startDate ?? '',
      endDate: e.endDate ?? '',
      active: e.active === true,
      finished: e.status === EventStatus.CLOSED,
      inProgress: e.status === EventStatus.AVAILABLE,
      resultsPublished: e.resultsPublished === true,
    }));
  }

  async listAwardsByProjects(projectIds: number[]): Promise<ParticipationAward[]> {
    if (!projectIds.length) return [];
    const res = await this.grpc.listAwardsByProjects(projectIds);
    return (res?.awards ?? []).map((a: any) => ({
      projectId: Number(a.projectId),
      awardId: Number(a.awardId),
      title: a.title ?? '',
      position: Number(a.position ?? 0),
      categoryName: a.categoryName ?? '',
      eventId: Number(a.eventId),
      resultsPublished: a.resultsPublished === true,
    }));
  }

  async listCategoriesByIds(ids: number[]): Promise<{ id: number; name: string }[]> {
    if (!ids.length) return [];
    const res = await this.grpc.listCategoriesByIds(ids);
    return (res?.categories ?? []).map((c: any) => ({
      id: Number(c.id),
      name: c.name ?? '',
    }));
  }
}
