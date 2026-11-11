import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreateCriterionUseCase } from '@criterions/application/use-cases/create-criterion.use-case';
import { UpdateCriterionUseCase } from '@criterions/application/use-cases/update-criterion.use-case';
import { GetCriterionUseCase } from '@criterions/application/use-cases/get-criterion.use-case';
import { ListCriterionsUseCase } from '@criterions/application/use-cases/list-criterions.use-case';
import { DeleteCriterionUseCase } from '@criterions/application/use-cases/delete-criterion.use-case';
import { FindByCourseUseCase } from '@criterions/application/use-cases/find-by-course.use-case';
import { CreateComponentUseCase } from '@criterions/application/use-cases/create-component.use-case';
import { GetComponentUseCase } from '@criterions/application/use-cases/get-component.use-case';
import { ListComponentsUseCase } from '@criterions/application/use-cases/list-components.use-case';
import { UpdateComponentUseCase } from '@criterions/application/use-cases/update-component.use-case';
import { DeleteComponentUseCase } from '@criterions/application/use-cases/delete-component.use-case';
import { GetRubricReadinessUseCase } from '@criterions/application/use-cases/get-rubric-readiness.use-case';
import { CreateCriterionDto } from '@criterions/application/dto/create-criterion.dto';
import { UpdateCriterionDto } from '@criterions/application/dto/update-criterion.dto';
import { DeleteCriterionDto } from '@criterions/application/dto/delete-criterion.dto';
import { ListCriterionsDto } from '@criterions/application/dto/list-criterions.dto';
import { GetCriterionDto } from '@criterions/application/dto/get-criterion.dto';
import { FindByCourseDto } from '@criterions/application/dto/find-by-course.dto';
import { CreateComponentDto } from '@criterions/application/dto/create-component.dto';
import { GetComponentDto } from '@criterions/application/dto/get-component.dto';
import { UpdateComponentDto } from '@criterions/application/dto/update-component.dto';
import { DeleteComponentDto } from '@criterions/application/dto/delete-component.dto';
import { GetRubricReadinessDto } from '@criterions/application/dto/get-rubric-readiness.dto';
import {
  CRITERIONS_SERVICE_NAME,
  CriterionProto,
  ListCriterionsResponse,
  DeleteCriterionResponse,
  FindCriterionsByCourseResponse,
  GetRubricReadinessResponse,
} from '@app/common/generated/evaluation';
import { CriterionMapper } from '@criterions/application/mappers/criterion.mapper';
import { Component } from '@criterions/domain/entities/component.entity';

@Controller()
export class CriterionsController {
  constructor(
    private readonly createCriterionUseCase: CreateCriterionUseCase,
    private readonly updateCriterionUseCase: UpdateCriterionUseCase,
    private readonly getCriterionUseCase: GetCriterionUseCase,
    private readonly listCriterionsUseCase: ListCriterionsUseCase,
    private readonly deleteCriterionUseCase: DeleteCriterionUseCase,
    private readonly findByCourseUseCase: FindByCourseUseCase,
    private readonly createComponentUseCase: CreateComponentUseCase,
    private readonly getComponentUseCase: GetComponentUseCase,
    private readonly listComponentsUseCase: ListComponentsUseCase,
    private readonly updateComponentUseCase: UpdateComponentUseCase,
    private readonly deleteComponentUseCase: DeleteComponentUseCase,
    private readonly getRubricReadinessUseCase: GetRubricReadinessUseCase,
  ) { }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'CreateCriterion')
  async createCriterion(request: CreateCriterionDto): Promise<CriterionProto> {
    const result = await this.createCriterionUseCase.execute(request);
    return CriterionMapper.toCreateCriterionResponse(result);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'UpdateCriterion')
  async updateCriterion(request: UpdateCriterionDto): Promise<CriterionProto> {
    const result = await this.updateCriterionUseCase.execute(request);
    return CriterionMapper.toUpdateCriterionResponse(result);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'GetCriterion')
  async getCriterion(request: GetCriterionDto): Promise<CriterionProto> {
    const result = await this.getCriterionUseCase.execute(request);
    return CriterionMapper.toGetCriterionResponse(result);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'FindCriterionsByCourse')
  async findCriterionsByCourse(request: FindByCourseDto): Promise<FindCriterionsByCourseResponse> {
    const { criterions, components } = await this.findByCourseUseCase.execute(request);
    return CriterionMapper.toFindCriterionsByCourseResponse(criterions, components);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'ListCriterions')
  async listCriterions(request: ListCriterionsDto): Promise<ListCriterionsResponse> {
    const result = await this.listCriterionsUseCase.execute(request);
    return CriterionMapper.toListCriterionsResponse(result, request.page!, request.limit!);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'DeleteCriterion')
  async deleteCriterion(request: DeleteCriterionDto): Promise<DeleteCriterionResponse> {
    await this.deleteCriterionUseCase.execute(request);
    return CriterionMapper.toDeleteCriterionResponse(true);
  }

  // Component CRUD methods
  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'CreateComponent')
  async createComponent(request: CreateComponentDto): Promise<any> {
    const component = await this.createComponentUseCase.execute(request);
    return this.componentToProto(component);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'GetComponent')
  async getComponent(request: GetComponentDto): Promise<any> {
    const component = await this.getComponentUseCase.execute(request);
    return this.componentToProto(component);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'ListComponents')
  async listComponents(): Promise<any> {
    const components = await this.listComponentsUseCase.execute();
    return {
      components: components.map(c => this.componentToProto(c)),
    };
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'UpdateComponent')
  async updateComponent(request: UpdateComponentDto): Promise<any> {
    const component = await this.updateComponentUseCase.execute(request);
    return this.componentToProto(component);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'DeleteComponent')
  async deleteComponent(request: DeleteComponentDto): Promise<DeleteCriterionResponse> {
    await this.deleteComponentUseCase.execute(request);
    return CriterionMapper.toDeleteCriterionResponse(true);
  }

  @GrpcMethod(CRITERIONS_SERVICE_NAME, 'GetRubricReadiness')
  async getRubricReadiness(request: GetRubricReadinessDto): Promise<GetRubricReadinessResponse> {
    const readiness = await this.getRubricReadinessUseCase.execute(request);
    return {
      eventId: readiness.eventId,
      componentsWeight: readiness.componentsWeight,
      components: readiness.components.map((c) => this.componentToProto(c)),
      categories: readiness.categories,
    };
  }

  private componentToProto(component: Component): any {
    return {
      id: component.id,
      name: component.name,
      weight: component.weight,
      ...(component.eventId != null && { eventId: component.eventId }),
    };
  }
}
