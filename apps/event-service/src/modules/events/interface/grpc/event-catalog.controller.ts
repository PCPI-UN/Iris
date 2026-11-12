import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EVENT_SERVICE_NAME } from '@app/common/generated/event';
import { EventCatalogService } from '@events/application/event-catalog.service';
import { ListAwardsByProjectsUC } from '@events/application/use-cases/list-awards-by-projects.uc';
import { ListAwardsByProjectsDTO } from '@events/application/dto/list-awards-by-projects.dto';
import { ProjectAwardMapper } from '@events/application/mappers/project-award.mapper';
import { ListCategoriesByIdsUC } from '@events/application/use-cases/list-categories-by-ids.uc';
import { ListCategoriesByIdsDTO } from '@events/application/dto/list-categories-by-ids.dto';
import { EventCategoryMapper } from '@events/application/mappers/event-category.mapper';

@Controller()
export class EventCatalogController {
  constructor(
    private readonly catalogService: EventCatalogService,
    private readonly listAwardsByProjectsUC: ListAwardsByProjectsUC,
    private readonly listCategoriesByIdsUC: ListCategoriesByIdsUC,
  ) {}

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateCategory')
  createCategory(request: any) {
    return this.catalogService.createCategory(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'UpdateCategory')
  updateCategory(request: any) {
    return this.catalogService.updateCategory(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetCategory')
  getCategory(request: any) {
    return this.catalogService.getCategory(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListCategories')
  listCategories(request: any) {
    return this.catalogService.listCategories(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListCategoriesByEvent')
  listCategoriesByEvent(request: any) {
    return this.catalogService.listCategories(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'DeleteCategory')
  deleteCategory(request: any) {
    return this.catalogService.deleteCategory(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateCategoryAward')
  createCategoryAward(request: any) {
    return this.catalogService.createCategoryAward(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'UpdateCategoryAward')
  updateCategoryAward(request: any) {
    return this.catalogService.updateCategoryAward(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetCategoryAward')
  getCategoryAward(request: any) {
    return this.catalogService.getCategoryAward(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListCategoryAwards')
  listCategoryAwards(request: any) {
    return this.catalogService.listCategoryAwards(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'DeleteCategoryAward')
  deleteCategoryAward(request: any) {
    return this.catalogService.deleteCategoryAward(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateAwardWinner')
  createAwardWinner(request: any) {
    return this.catalogService.createAwardWinner(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'UpdateAwardWinner')
  updateAwardWinner(request: any) {
    return this.catalogService.updateAwardWinner(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetAwardWinner')
  getAwardWinner(request: any) {
    return this.catalogService.getAwardWinner(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListAwardWinners')
  listAwardWinners(request: any) {
    return this.catalogService.listAwardWinners(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'DeleteAwardWinner')
  deleteAwardWinner(request: any) {
    return this.catalogService.deleteAwardWinner(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateEventInscriptionDetail')
  createEventInscriptionDetail(request: any) {
    return this.catalogService.createEventInscriptionDetail(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'UpdateEventInscriptionDetail')
  updateEventInscriptionDetail(request: any) {
    return this.catalogService.updateEventInscriptionDetail(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetEventInscriptionDetail')
  getEventInscriptionDetail(request: any) {
    return this.catalogService.getEventInscriptionDetail(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListEventInscriptionDetails')
  listEventInscriptionDetails(request: any) {
    return this.catalogService.listEventInscriptionDetails(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'DeleteEventInscriptionDetail')
  deleteEventInscriptionDetail(request: any) {
    return this.catalogService.deleteEventInscriptionDetail(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateEventRecap')
  createEventRecap(request: any) {
    return this.catalogService.createEventRecap(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'UpdateEventRecap')
  updateEventRecap(request: any) {
    return this.catalogService.updateEventRecap(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'GetEventRecap')
  getEventRecap(request: any) {
    return this.catalogService.getEventRecap(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListEventRecaps')
  listEventRecaps(request: any) {
    return this.catalogService.listEventRecaps(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'DeleteEventRecap')
  deleteEventRecap(request: any) {
    return this.catalogService.deleteEventRecap(request);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListAwardsByProjects')
  async listAwardsByProjects(request: ListAwardsByProjectsDTO) {
    const awards = await this.listAwardsByProjectsUC.execute(request);
    return ProjectAwardMapper.toListResponse(awards);
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListCategoriesByIds')
  async listCategoriesByIds(request: ListCategoriesByIdsDTO) {
    const categories = await this.listCategoriesByIdsUC.execute(request);
    return EventCategoryMapper.toListResponse(categories);
  }
}
