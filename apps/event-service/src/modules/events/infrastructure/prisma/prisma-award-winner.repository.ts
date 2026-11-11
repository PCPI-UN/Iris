import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AwardWinnerRepository } from '../../domain/repositories/award-winner.repository';
import { ProjectAward } from '../../domain/entities/project-award.entity';

@Injectable()
export class PrismaAwardWinnerRepository extends AwardWinnerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByProjectIds(projectIds: number[]): Promise<ProjectAward[]> {
    if (!projectIds.length) return [];

    const rows = await this.prisma.awardWinnerEvent.findMany({
      where: { projectId: { in: projectIds } },
      include: { award: { include: { category: true } } },
      orderBy: [
        { award: { category: { eventId: 'asc' } } },
        { award: { categoryId: 'asc' } },
        { award: { position: 'asc' } },
        { id: 'asc' },
      ],
    });

    return rows.map(
      (row) =>
        new ProjectAward(
          row.id,
          row.projectId,
          row.awardId,
          row.award.title,
          row.award.position,
          row.award.categoryId,
          row.award.category.name,
          row.award.category.eventId,
        ),
    );
  }
}
