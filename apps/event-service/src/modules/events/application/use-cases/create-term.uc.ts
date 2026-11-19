import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { TermRepository } from '@events/domain/repositories/term.repository';
import { Term } from '@events/domain/entities/term.entity';
import { CreateTermDTO } from '@events/application/dto/create-term.dto';

@Injectable()
export class CreateTermUC {
  constructor(private readonly terms: TermRepository) {}

  async execute(input: CreateTermDTO): Promise<Term> {
    const period = input.period.trim();
    if (await this.terms.findByYearAndPeriod(input.year, period)) {
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: `Term ${input.year}${period} already exists`,
      });
    }
    return this.terms.create({ year: input.year, period });
  }
}
