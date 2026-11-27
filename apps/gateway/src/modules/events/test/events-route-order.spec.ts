import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { CacheService } from '../../../common/cache/cache.service';
import { EventService } from '../events.service';
import { EventsController } from '../events.controller';

/**
 * Nest matches routes in declaration order. `GET /events/:id` (ParseIntPipe)
 * used to be declared before the literal list routes, so a request such as
 * `GET /events/category-awards?categoryId=1` hit it and answered
 * 400 "Validation failed (numeric string is expected)".
 */
describe('EventsController route order', () => {
  let app: INestApplication;
  const service = {
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listCourses: jest.fn(),
    listCategories: jest.fn(),
    listCategoryAwards: jest.fn(),
    listAwardWinners: jest.fn(),
    listEventInscriptionDetails: jest.fn(),
    listEventRecaps: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventService, useValue: service },
        { provide: CacheService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(service).forEach((fn) =>
      fn.mockReset().mockResolvedValue({}),
    );
  });

  const server = () => app.getHttpServer() as App;

  it.each([
    ['courses', 'listCourses'],
    ['categories', 'listCategories'],
    ['category-awards', 'listCategoryAwards'],
    ['award-winners', 'listAwardWinners'],
    ['inscription-details', 'listEventInscriptionDetails'],
    ['recaps', 'listEventRecaps'],
  ] as const)(
    'GET /events/%s reaches %s, not GET /events/:id',
    async (path, method) => {
      await request(server()).get(`/events/${path}`).expect(200);

      expect(service[method]).toHaveBeenCalledTimes(1);
      expect(service.get).not.toHaveBeenCalled();
    },
  );

  it('GET /events/:id still serves a numeric id', async () => {
    await request(server()).get('/events/7').expect(200);

    expect(service.get).toHaveBeenCalledWith({ id: 7 });
  });

  it('GET /events/:id still rejects a non-numeric id', async () => {
    await request(server()).get('/events/not-a-route').expect(400);

    expect(service.get).not.toHaveBeenCalled();
  });
});
