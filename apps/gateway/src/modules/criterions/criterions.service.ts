import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';
import { ListCriterionsDto } from './dto/list-criterions.dto';
import { FindCriterionsByCourseDto } from './dto/find-criterions-by-course.dto';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';
import {
  CriterionsServiceClient,
  CRITERIONS_SERVICE_NAME,
  CreateCriterionRequest,
  UpdateCriterionRequest,
  GetCriterionRequest,
  ListCriterionsRequest,
  FindCriterionsByCourseRequest,
  DeleteCriterionRequest,
  CriterionProto,
  ListCriterionsResponse,
  FindCriterionsByCourseResponse,
  DeleteCriterionResponse,
} from '@app/common/generated/evaluation';

@Injectable()
export class CriterionsService implements OnModuleInit {
  private criterionsService: CriterionsServiceClient;

  constructor(
    @Inject(CRITERIONS_SERVICE_NAME) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.criterionsService =
      this.client.getService<CriterionsServiceClient>(CRITERIONS_SERVICE_NAME);
  }

  async createCriterion(
    request: CreateCriterionDto,
  ): Promise<CriterionProto> {
    // weight is not a proto optional field; criteria inside a component get theirs from the component
    return firstValueFrom(
      this.criterionsService.createCriterion({
        ...request,
        weight: request.weight ?? 0,
      }),
    );
  }

  async updateCriterion(
    id: number,
    request: UpdateCriterionDto,
  ): Promise<CriterionProto> {
    return firstValueFrom(
      this.criterionsService.updateCriterion({
        id,
        ...request,
        courseIds: request.courseIds ?? [],
      }
    ));
  }

  async getCriterion(id: number): Promise<CriterionProto> {
    return firstValueFrom(
      this.criterionsService.getCriterion({ id } as GetCriterionRequest),
    );
  }

  async listCriterions(
    request: ListCriterionsDto,
  ): Promise<ListCriterionsResponse> {
    return firstValueFrom(this.criterionsService.listCriterions(request));
  }

  async findCriterionsByCourse(
    courseId: number,
  ): Promise<FindCriterionsByCourseResponse> {
    return firstValueFrom(
      this.criterionsService.findCriterionsByCourse({
        courseId,
      } as FindCriterionsByCourseRequest),
    );
  }

  async deleteCriterion(id: number): Promise<DeleteCriterionResponse> {
    return firstValueFrom(
      this.criterionsService.deleteCriterion({ id } as DeleteCriterionRequest),
    );
  }

  // Component methods
  async createComponent(request: CreateComponentDto): Promise<any> {
    return firstValueFrom(this.criterionsService.createComponent(request));
  }

  async getComponent(id: number): Promise<any> {
    return firstValueFrom(
      this.criterionsService.getComponent({ id }),
    );
  }

  async listComponents(): Promise<any> {
    return firstValueFrom(
      this.criterionsService.listComponents({}),
    );
  }

  async updateComponent(
    id: number,
    request: UpdateComponentDto,
  ): Promise<any> {
    return firstValueFrom(
      this.criterionsService.updateComponent({
        id,
        ...request,
      }),
    );
  }

  async deleteComponent(id: number): Promise<DeleteCriterionResponse> {
    return firstValueFrom(
      this.criterionsService.deleteComponent({ id }),
    );
  }
}
