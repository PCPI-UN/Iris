import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';

/** Repositories query through `PrismaService.db`, so they take the transaction opened here. */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.transaction(() => work());
  }
}
