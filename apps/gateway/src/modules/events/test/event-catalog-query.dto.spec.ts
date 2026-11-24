import { ValidationPipe } from '@nestjs/common';
import {
  ListAwardWinnersDTO,
  ListCategoriesDTO,
  ListCategoryAwardsDTO,
  ListEventInscriptionDetailsDTO,
  ListEventRecapsDTO,
} from '../dto/event-catalog.dto';

// Same options as the global pipe in main.ts: query params arrive as strings
// and there is no implicit conversion, so each numeric field needs @Type.
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const parseQuery = <T>(
  metatype: new () => T,
  query: Record<string, string>,
): Promise<T> => pipe.transform(query, { type: 'query', metatype });

describe('event catalog list query DTOs', () => {
  it('accepts categoryId, page and limit as strings (GET /events/category-awards)', async () => {
    const dto = await parseQuery(ListCategoryAwardsDTO, {
      categoryId: '1',
      page: '2',
      limit: '20',
    });

    expect(dto).toBeInstanceOf(ListCategoryAwardsDTO);
    expect(dto).toMatchObject({ categoryId: 1, page: 2, limit: 20 });
  });

  it('accepts awardId as a string (GET /events/award-winners)', async () => {
    const dto = await parseQuery(ListAwardWinnersDTO, { awardId: '7' });

    expect(dto).toMatchObject({ awardId: 7, page: 1, limit: 10 });
  });

  it('accepts eventId as a string in categories, inscription details and recaps', async () => {
    for (const metatype of [
      ListCategoriesDTO,
      ListEventInscriptionDetailsDTO,
      ListEventRecapsDTO,
    ]) {
      const dto = await parseQuery<{ eventId?: number }>(metatype, {
        eventId: '3',
      });
      expect(dto.eventId).toBe(3);
    }
  });

  it('reads onlyActive=true/false in the categories list', async () => {
    const active = await parseQuery(ListCategoriesDTO, { onlyActive: 'true' });
    const all = await parseQuery(ListCategoriesDTO, { onlyActive: 'false' });

    expect(active.onlyActive).toBe(true);
    expect(all.onlyActive).toBe(false);
  });

  it('still rejects ids that are not integers', async () => {
    await expect(
      parseQuery(ListAwardWinnersDTO, { awardId: 'abc' }),
    ).rejects.toThrow();
    await expect(
      parseQuery(ListCategoryAwardsDTO, { categoryId: '1.5' }),
    ).rejects.toThrow();
    await expect(
      parseQuery(ListCategoryAwardsDTO, { categoryId: '0' }),
    ).rejects.toThrow();
  });

  it('still enforces the pagination bounds', async () => {
    await expect(
      parseQuery(ListCategoryAwardsDTO, { limit: '101' }),
    ).rejects.toThrow();
    await expect(
      parseQuery(ListCategoryAwardsDTO, { page: '0' }),
    ).rejects.toThrow();
  });
});
