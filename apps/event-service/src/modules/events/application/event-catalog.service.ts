import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@common/prisma/prisma.service';
import {
  AwardWinnerProto,
  CategoryAwardProto,
  CategoryProto,
  EventInscriptionDetailProto,
  EventRecapProto,
  PaginationMetadata,
} from '@app/common/generated/event';

@Injectable()
export class EventCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  private buildMeta(total: number, count: number, page: number, limit: number): PaginationMetadata {
    return {
      total,
      itemsOnCurrentPage: count,
      itemsPerPage: limit,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private notFound(entity: string, id: number): never {
    throw new RpcException({
      code: 5,
      message: `No se encontró ${entity} con ID ${id}`,
    });
  }

  private toCategoryProto(category: any): CategoryProto {
    return {
      id: category.id,
      eventId: category.eventId,
      name: category.name ?? '',
      description: category.description ?? '',
      active: category.active ?? true,
      createdAt: category.createdAt?.toISOString() ?? '',
      updatedAt: category.updatedAt?.toISOString() ?? '',
    };
  }

  private toCategoryAwardProto(award: any): CategoryAwardProto {
    return {
      id: award.id,
      categoryId: award.categoryId,
      title: award.title ?? '',
      description: award.description ?? '',
      value: award.value ?? 0,
      position: award.position ?? 0,
      createdAt: award.createdAt?.toISOString() ?? '',
      updatedAt: award.updatedAt?.toISOString() ?? '',
    };
  }

  private toAwardWinnerProto(winner: any): AwardWinnerProto {
    return {
      id: winner.id,
      awardId: winner.awardId,
      projectId: winner.projectId,
      grade: winner.grade ?? 0,
      createdAt: winner.createdAt?.toISOString() ?? '',
      assignedByUserId: winner.assignedByUserId,
    };
  }

  private toInscriptionDetailProto(detail: any): EventInscriptionDetailProto {
    return {
      id: detail.id,
      eventId: detail.eventId,
      title: detail.title ?? '',
      description: detail.description ?? '',
      value: detail.value ?? 0,
      isRequired: detail.isRequired ?? true,
      createdAt: detail.createdAt?.toISOString() ?? '',
      updatedAt: detail.updatedAt?.toISOString() ?? '',
    };
  }

  private toEventRecapProto(recap: any): EventRecapProto {
    return {
      id: recap.id,
      eventId: recap.eventId,
      headline: recap.headline ?? '',
      summary: recap.summary ?? '',
      closingMessage: recap.closingMessage ?? '',
      galeryUrl: recap.galeryUrl ?? '',
      published: recap.published ?? false,
      createdAt: recap.createdAt?.toISOString() ?? '',
      updatedAt: recap.updatedAt?.toISOString() ?? '',
    };
  }

  async createCategory(input: any) {
    const category = await this.db.category.create({
      data: {
        eventId: input.eventId,
        name: input.name,
        description: input.description || null,
        active: input.active ?? true,
      },
    });
    return { category: this.toCategoryProto(category) };
  }

  async updateCategory(input: any) {
    const existing = await this.db.category.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('Category', input.id);
    const category = await this.db.category.update({
      where: { id: input.id },
      data: {
        name: input.name || undefined,
        description: input.description !== undefined ? input.description : undefined,
        active: input.active,
      },
    });
    return { category: this.toCategoryProto(category) };
  }

  async getCategory(input: any) {
    const category = await this.db.category.findUnique({ where: { id: input.id } });
    if (!category) this.notFound('Category', input.id);
    return { category: this.toCategoryProto(category) };
  }

  async listCategories(input: any) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 10;
    const where: any = {};
    if (input.eventId !== undefined) where.eventId = input.eventId;
    if (input.onlyActive) where.active = true;
    if (input.q) {
      where.OR = [
        { name: { contains: input.q, mode: 'insensitive' } },
        { description: { contains: input.q, mode: 'insensitive' } },
      ];
    }

    const [categories, total] = await this.db.$transaction([
      this.db.category.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.db.category.count({ where }),
    ]);

    return {
      categories: categories.map((category: any) => this.toCategoryProto(category)),
      meta: this.buildMeta(total, categories.length, page, limit),
    };
  }

  async deleteCategory(input: any) {
    const existing = await this.db.category.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('Category', input.id);
    await this.db.category.delete({ where: { id: input.id } });
    return { ok: true };
  }

  async createCategoryAward(input: any) {
    const award = await this.db.awardCategoryEvent.create({
      data: {
        categoryId: input.categoryId,
        title: input.title,
        description: input.description || null,
        value: input.value ?? null,
        position: input.position ?? 0,
      },
    });
    return { award: this.toCategoryAwardProto(award) };
  }

  async updateCategoryAward(input: any) {
    const existing = await this.db.awardCategoryEvent.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('CategoryAward', input.id);
    const award = await this.db.awardCategoryEvent.update({
      where: { id: input.id },
      data: {
        title: input.title || undefined,
        description: input.description !== undefined ? input.description : undefined,
        value: input.value !== undefined ? input.value : undefined,
        position: input.position !== undefined ? input.position : undefined,
      },
    });
    return { award: this.toCategoryAwardProto(award) };
  }

  async getCategoryAward(input: any) {
    const award = await this.db.awardCategoryEvent.findUnique({ where: { id: input.id } });
    if (!award) this.notFound('CategoryAward', input.id);
    return { award: this.toCategoryAwardProto(award) };
  }

  async listCategoryAwards(input: any) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 10;
    const where: any = {};
    if (input.categoryId !== undefined) where.categoryId = input.categoryId;

    const [awards, total] = await this.db.$transaction([
      this.db.awardCategoryEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
      this.db.awardCategoryEvent.count({ where }),
    ]);

    return {
      awards: awards.map((award: any) => this.toCategoryAwardProto(award)),
      meta: this.buildMeta(total, awards.length, page, limit),
    };
  }

  async deleteCategoryAward(input: any) {
    const existing = await this.db.awardCategoryEvent.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('CategoryAward', input.id);
    await this.db.awardCategoryEvent.delete({ where: { id: input.id } });
    return { ok: true };
  }

  async createAwardWinner(input: any) {
    const winner = await this.db.awardWinnerEvent.create({
      data: {
        awardId: input.awardId,
        projectId: input.projectId,
        grade: input.grade,
        assignedByUserId: input.assignedByUserId,
      },
    });
    return { winner: this.toAwardWinnerProto(winner) };
  }

  async updateAwardWinner(input: any) {
    const existing = await this.db.awardWinnerEvent.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('AwardWinner', input.id);
    const winner = await this.db.awardWinnerEvent.update({
      where: { id: input.id },
      data: {
        projectId: input.projectId !== undefined ? input.projectId : undefined,
        grade: input.grade !== undefined ? input.grade : undefined,
        assignedByUserId: input.assignedByUserId !== undefined ? input.assignedByUserId : undefined,
      },
    });
    return { winner: this.toAwardWinnerProto(winner) };
  }

  async getAwardWinner(input: any) {
    const winner = await this.db.awardWinnerEvent.findUnique({ where: { id: input.id } });
    if (!winner) this.notFound('AwardWinner', input.id);
    return { winner: this.toAwardWinnerProto(winner) };
  }

  async listAwardWinners(input: any) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 10;
    const where: any = {};
    if (input.awardId !== undefined) where.awardId = input.awardId;

    const [winners, total] = await this.db.$transaction([
      this.db.awardWinnerEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ grade: 'desc' }, { id: 'asc' }],
      }),
      this.db.awardWinnerEvent.count({ where }),
    ]);

    return {
      winners: winners.map((winner: any) => this.toAwardWinnerProto(winner)),
      meta: this.buildMeta(total, winners.length, page, limit),
    };
  }

  async deleteAwardWinner(input: any) {
    const existing = await this.db.awardWinnerEvent.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('AwardWinner', input.id);
    await this.db.awardWinnerEvent.delete({ where: { id: input.id } });
    return { ok: true };
  }

  async createEventInscriptionDetail(input: any) {
    const detail = await this.db.eventInscriptionDetail.create({
      data: {
        eventId: input.eventId,
        title: input.title,
        description: input.description || null,
        value: input.value ?? 0,
        isRequired: input.isRequired ?? true,
      },
    });
    return { detail: this.toInscriptionDetailProto(detail) };
  }

  async updateEventInscriptionDetail(input: any) {
    const existing = await this.db.eventInscriptionDetail.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('EventInscriptionDetail', input.id);
    const detail = await this.db.eventInscriptionDetail.update({
      where: { id: input.id },
      data: {
        title: input.title || undefined,
        description: input.description !== undefined ? input.description : undefined,
        value: input.value !== undefined ? input.value : undefined,
        isRequired: input.isRequired !== undefined ? input.isRequired : undefined,
      },
    });
    return { detail: this.toInscriptionDetailProto(detail) };
  }

  async getEventInscriptionDetail(input: any) {
    const detail = await this.db.eventInscriptionDetail.findUnique({ where: { id: input.id } });
    if (!detail) this.notFound('EventInscriptionDetail', input.id);
    return { detail: this.toInscriptionDetailProto(detail) };
  }

  async listEventInscriptionDetails(input: any) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 10;
    const where: any = {};
    if (input.eventId !== undefined) where.eventId = input.eventId;

    const [details, total] = await this.db.$transaction([
      this.db.eventInscriptionDetail.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.db.eventInscriptionDetail.count({ where }),
    ]);

    return {
      details: details.map((detail: any) => this.toInscriptionDetailProto(detail)),
      meta: this.buildMeta(total, details.length, page, limit),
    };
  }

  async deleteEventInscriptionDetail(input: any) {
    const existing = await this.db.eventInscriptionDetail.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('EventInscriptionDetail', input.id);
    await this.db.eventInscriptionDetail.delete({ where: { id: input.id } });
    return { ok: true };
  }

  async createEventRecap(input: any) {
    const recap = await this.db.eventRecap.create({
      data: {
        eventId: input.eventId,
        headline: input.headline,
        summary: input.summary || null,
        closingMessage: input.closingMessage || null,
        galeryUrl: input.galeryUrl || null,
        published: input.published ?? false,
      },
    });
    return { recap: this.toEventRecapProto(recap) };
  }

  async updateEventRecap(input: any) {
    const existing = await this.db.eventRecap.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('EventRecap', input.id);
    const recap = await this.db.eventRecap.update({
      where: { id: input.id },
      data: {
        headline: input.headline || undefined,
        summary: input.summary !== undefined ? input.summary : undefined,
        closingMessage: input.closingMessage !== undefined ? input.closingMessage : undefined,
        galeryUrl: input.galeryUrl !== undefined ? input.galeryUrl : undefined,
        published: input.published !== undefined ? input.published : undefined,
      },
    });
    return { recap: this.toEventRecapProto(recap) };
  }

  async getEventRecap(input: any) {
    const recap = await this.db.eventRecap.findUnique({ where: { id: input.id } });
    if (!recap) this.notFound('EventRecap', input.id);
    return { recap: this.toEventRecapProto(recap) };
  }

  async listEventRecaps(input: any) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 10;
    const where: any = {};
    if (input.eventId !== undefined) where.eventId = input.eventId;

    const [recaps, total] = await this.db.$transaction([
      this.db.eventRecap.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.db.eventRecap.count({ where }),
    ]);

    return {
      recaps: recaps.map((recap: any) => this.toEventRecapProto(recap)),
      meta: this.buildMeta(total, recaps.length, page, limit),
    };
  }

  async deleteEventRecap(input: any) {
    const existing = await this.db.eventRecap.findUnique({ where: { id: input.id } });
    if (!existing) this.notFound('EventRecap', input.id);
    await this.db.eventRecap.delete({ where: { id: input.id } });
    return { ok: true };
  }
}
