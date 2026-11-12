import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { CategoryRepository } from '../../domain/repositories/category.repository';
import { EventCategory } from '../../domain/entities/event-category.entity';

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByIds(ids: number[]): Promise<EventCategory[]> {
    if (!ids.length) return [];

    const rows = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });

    return rows.map(
      (row) =>
        new EventCategory(
          row.id,
          row.eventId,
          row.name,
          row.description,
          row.active,
          row.createdAt,
          row.updatedAt,
        ),
    );
  }
}
