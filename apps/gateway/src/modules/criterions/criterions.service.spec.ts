import { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import { CriterionsService } from './criterions.service';

describe('CriterionsService (gateway)', () => {
  const buildService = (response: unknown) => {
    const getRubricReadiness = jest.fn().mockReturnValue(of(response));
    const client = { getService: () => ({ getRubricReadiness }) } as unknown as ClientGrpc;
    const service = new CriterionsService(client);
    service.onModuleInit();
    return { service, getRubricReadiness };
  };

  it('fills the fields that gRPC omits for proto3 defaults', async () => {
    const { service } = buildService({
      eventId: 1,
      components: [],
      categories: [{ courseId: 10 }],
    });

    await expect(service.getRubricReadiness(1)).resolves.toEqual({
      eventId: 1,
      componentsWeight: 0,
      componentsLocked: false,
      components: [],
      categories: [
        {
          courseId: 10,
          ready: false,
          criteriaCount: 0,
          missingComponentIds: [],
          criteriaWithoutComponent: [],
          locked: false,
        },
      ],
    });
  });

  it('keeps the values that were sent', async () => {
    const { service } = buildService({
      eventId: 1,
      componentsWeight: 1,
      componentsLocked: true,
      components: [],
      categories: [
        { courseId: 10, ready: true, criteriaCount: 3, missingComponentIds: [], criteriaWithoutComponent: [4], locked: true },
      ],
    });

    const result = await service.getRubricReadiness(1);

    expect(result.componentsLocked).toBe(true);
    expect(result.categories[0]).toEqual(
      expect.objectContaining({ ready: true, criteriaCount: 3, criteriaWithoutComponent: [4], locked: true }),
    );
  });

  it('sends the course only when it is given', async () => {
    const { service, getRubricReadiness } = buildService({ eventId: 1 });

    await service.getRubricReadiness(1);
    await service.getRubricReadiness(1, 10);

    expect(getRubricReadiness).toHaveBeenNthCalledWith(1, { eventId: 1 });
    expect(getRubricReadiness).toHaveBeenNthCalledWith(2, { eventId: 1, courseId: 10 });
  });
});
