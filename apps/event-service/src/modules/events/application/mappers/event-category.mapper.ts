import {
  CategoryProto,
  ListCategoriesByIdsResponse,
} from '@app/common/generated/event';
import { EventCategory } from '../../domain/entities/event-category.entity';

export class EventCategoryMapper {
  static toProto(category: EventCategory): CategoryProto {
    return {
      id: category.id,
      eventId: category.eventId,
      name: category.name,
      description: category.description ?? '',
      active: category.active,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  static toListResponse(
    categories: EventCategory[],
  ): ListCategoriesByIdsResponse {
    return { categories: categories.map((c) => this.toProto(c)) };
  }
}
