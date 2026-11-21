import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { EVENT_SERVICE_NAME, ListTermsResponse, TermProto } from '@app/common/generated/event';
import { ListTermsUC } from '@events/application/use-cases/list-terms.uc';
import { CreateTermUC } from '@events/application/use-cases/create-term.uc';
import { CreateTermDTO } from '@events/application/dto/create-term.dto';
import { TermMapper } from '@events/application/mappers/term.mapper';

@Controller()
export class TermsController {
  constructor(
    private readonly listTermsUC: ListTermsUC,
    private readonly createTermUC: CreateTermUC,
  ) {}

  @GrpcMethod(EVENT_SERVICE_NAME, 'ListTerms')
  async listTerms(): Promise<ListTermsResponse> {
    return TermMapper.toListTermsResponse(await this.listTermsUC.execute());
  }

  @GrpcMethod(EVENT_SERVICE_NAME, 'CreateTerm')
  async createTerm(request: CreateTermDTO): Promise<TermProto> {
    return TermMapper.toTermProto(await this.createTermUC.execute(request));
  }
}
