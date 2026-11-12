import { EventCategory } from '../entities/event-category.entity';

export abstract class CategoryRepository {
  /** Categories with the given ids, inactive ones included. */
  abstract findByIds(ids: number[]): Promise<EventCategory[]>;
}
