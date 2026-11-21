import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { TermRepository } from '@events/domain/repositories/term.repository';
import { NO_TERM_ID, Term } from '@events/domain/entities/term.entity';

const toTerm = (row: { id: number; year: number; period: string; createdAt: Date; updatedAt: Date }) =>
  new Term(row.id, row.year, row.period, row.createdAt, row.updatedAt);

@Injectable()
export class PrismaTermRepository extends TermRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: { year: number; period: string }): Promise<Term> {
    return toTerm(await this.prisma.term.create({ data }));
  }

  async findById(id: number): Promise<Term | null> {
    const row = await this.prisma.term.findUnique({ where: { id } });
    return row ? toTerm(row) : null;
  }

  async findByYearAndPeriod(year: number, period: string): Promise<Term | null> {
    const row = await this.prisma.term.findUnique({ where: { year_period: { year, period } } });
    return row ? toTerm(row) : null;
  }

  async listSelectable(): Promise<Term[]> {
    const rows = await this.prisma.term.findMany({
      where: { id: { not: NO_TERM_ID } },
      orderBy: [{ year: 'desc' }, { period: 'desc' }],
    });
    return rows.map(toTerm);
  }
}
