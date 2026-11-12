import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../../domain/repositories/category.repository';
import { EventCategory } from '../../domain/entities/event-category.entity';
import { ListCategoriesByIdsDTO } from '../dto/list-categories-by-ids.dto';

/**
 * Categories with the given ids in one call, inactive ones included (active = false).
 * Unknown ids are skipped. Used by the student dashboard to name the category of each
 * of the student's projects.
 */
@Injectable()
export class ListCategoriesByIdsUC {
  constructor(private readonly repo: CategoryRepository) {}

  async execute(input: ListCategoriesByIdsDTO): Promise<EventCategory[]> {
    const ids = [...new Set(input.ids ?? [])];
    if (!ids.length) return [];

    return this.repo.findByIds(ids);
  }
}
