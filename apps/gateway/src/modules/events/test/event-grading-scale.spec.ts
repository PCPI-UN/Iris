import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of, throwError } from 'rxjs';
import { EventService } from '../events.service';
import { GradingScaleDto } from '../../grading-scales/dto/grading-scale.dto';

/**
 * IRIS-V3-EVAL-03: an event is created or edited with a catalog grading scale (gradingScaleId;
 * new scales are created with POST /grading-scales) and the event response carries its scale.
 */
describe('EventService - grading scale of the event', () => {
  const finalProjects = { id: 1, name: 'Proyectos finales', isSystem: true, levels: [], locked: true };
  const build = () => {
    const eventGrpc = {
      createEvent: jest.fn(() => of({ event: { id: 9, name: 'Feria', status: 1 } })),
      updateEvent: jest.fn(() => of({ event: { id: 9, name: 'Feria', status: 1 } })),
      getEvent: jest.fn(() => of({ event: { id: 9, name: 'Feria', status: 1 } })),
      deleteEvent: jest.fn(() => of({ success: true })),
    };
    const gradingScaleGrpc = {
      assignEventGradingScale: jest.fn(() => of(finalProjects)),
      getEventGradingScale: jest.fn(() => of(finalProjects)),
      unassignEventGradingScale: jest.fn(() => of({ removed: true })),
    };
    const services: Record<string, unknown> = {
      EventService: eventGrpc,
      GradingScaleService: gradingScaleGrpc,
    };
    const grpcClient = { getService: jest.fn((name: string) => services[name] ?? {}) };

    const service = new EventService(grpcClient as any, grpcClient as any, grpcClient as any, {} as any, {} as any);
    service.onModuleInit();
    jest.spyOn(service, 'createCategory').mockResolvedValue({ category: { id: 3 } } as any);
    jest.spyOn(service as any, 'getAndCacheStatuses').mockResolvedValue([]);
    jest.spyOn(service as any, 'enrichEventWithCatalogData').mockImplementation(async (event: unknown) => event);
    jest.spyOn(service as any, 'updateEventCatalogData').mockResolvedValue(undefined);

    return { service, eventGrpc, gradingScaleGrpc };
  };

  it('assigns the default scale to a new event without a scale and returns it', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();

    const result = await service.create({ name: 'Feria', createdByUserId: 4 } as any);

    expect(gradingScaleGrpc.assignEventGradingScale).toHaveBeenCalledWith({
      eventId: 9,
      scaleId: undefined,
    });
    expect(eventGrpc.createEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ gradingScaleId: expect.anything() }),
    );
    expect((result.event as any).gradingScale).toEqual(finalProjects);
  });

  it('creates the event with a catalog scale', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();

    await service.create({ name: 'Feria', gradingScaleId: 4 } as any);

    expect(gradingScaleGrpc.assignEventGradingScale).toHaveBeenCalledWith({ eventId: 9, scaleId: 4 });
    expect(eventGrpc.createEvent).toHaveBeenCalledWith({ name: 'Feria' });
  });

  it('deletes the new event when its scale is rejected', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    gradingScaleGrpc.assignEventGradingScale.mockReturnValue(
      throwError(() => ({ code: 3, details: 'Invalid grading scale' })) as any,
    );

    await expect(service.create({ name: 'Feria', gradingScaleId: 77 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 3 }),
    );
    expect(eventGrpc.deleteEvent).toHaveBeenCalledWith({ id: 9 });
    expect(gradingScaleGrpc.unassignEventGradingScale).toHaveBeenCalledWith({ eventId: 9 });
  });

  it('deletes the new event and frees its scale when its category cannot be created', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    jest.spyOn(service, 'createCategory').mockRejectedValue({ code: 14, details: 'unavailable' });

    await expect(service.create({ name: 'Feria', gradingScaleId: 4 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 14 }),
    );
    expect(eventGrpc.deleteEvent).toHaveBeenCalledWith({ id: 9 });
    expect(gradingScaleGrpc.unassignEventGradingScale).toHaveBeenCalledWith({ eventId: 9 });
  });

  it('reports the original error when removing the scale of the deleted event fails', async () => {
    const { service, gradingScaleGrpc } = build();
    jest.spyOn(service, 'createCategory').mockRejectedValue({ code: 14, details: 'unavailable' });
    gradingScaleGrpc.unassignEventGradingScale.mockReturnValue(
      throwError(() => new Error('evaluation-service down')) as any,
    );

    await expect(service.create({ name: 'Feria' } as any)).rejects.toEqual(
      expect.objectContaining({ code: 14 }),
    );
  });

  it('reports the scale error even when the new event cannot be deleted', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    gradingScaleGrpc.assignEventGradingScale.mockReturnValue(
      throwError(() => ({ code: 5, details: 'Grading scale 77 not found' })) as any,
    );
    eventGrpc.deleteEvent.mockReturnValue(throwError(() => new Error('unavailable')) as any);

    await expect(service.create({ name: 'Feria', gradingScaleId: 77 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 5 }),
    );
    expect(eventGrpc.deleteEvent).toHaveBeenCalledWith({ id: 9 });
    // The event still exists, so it keeps its scale
    expect(gradingScaleGrpc.unassignEventGradingScale).not.toHaveBeenCalled();
  });

  it('changes the scale before the event fields, so a locked scale leaves the event untouched', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    gradingScaleGrpc.assignEventGradingScale.mockReturnValue(
      throwError(() => ({ code: 9, details: 'cannot change' })) as any,
    );

    await expect(service.update({ id: 9, name: 'Nueva', gradingScaleId: 2 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 9 }),
    );
    expect(eventGrpc.updateEvent).not.toHaveBeenCalled();
  });

  it('assigns the previous scale again when the event update fails', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    gradingScaleGrpc.assignEventGradingScale.mockReturnValueOnce(of({ ...finalProjects, id: 2 }) as any);
    eventGrpc.updateEvent.mockReturnValue(throwError(() => ({ code: 5, details: 'Event not found' })) as any);

    await expect(service.update({ id: 9, name: 'Nueva', gradingScaleId: 2 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 5 }),
    );
    expect(gradingScaleGrpc.assignEventGradingScale).toHaveBeenNthCalledWith(1, { eventId: 9, scaleId: 2 });
    expect(gradingScaleGrpc.assignEventGradingScale).toHaveBeenNthCalledWith(2, { eventId: 9, scaleId: 1 });
  });

  it('reports the update error even when the previous scale cannot be restored', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    gradingScaleGrpc.assignEventGradingScale
      .mockReturnValueOnce(of({ ...finalProjects, id: 2 }) as any)
      .mockReturnValueOnce(throwError(() => new Error('evaluation-service down')) as any);
    eventGrpc.updateEvent.mockReturnValue(throwError(() => ({ code: 3, details: 'Invalid dates' })) as any);

    await expect(service.update({ id: 9, gradingScaleId: 2 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 3 }),
    );
  });

  it('does not reassign anything when the event update fails with the same scale', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();
    eventGrpc.updateEvent.mockReturnValue(throwError(() => ({ code: 3, details: 'Invalid dates' })) as any);

    await expect(service.update({ id: 9, gradingScaleId: 1 } as any)).rejects.toEqual(
      expect.objectContaining({ code: 3 }),
    );
    expect(gradingScaleGrpc.assignEventGradingScale).toHaveBeenCalledTimes(1);
  });

  it('keeps the scale of an event updated without scale fields', async () => {
    const { service, eventGrpc, gradingScaleGrpc } = build();

    const result = await service.update({ id: 9, name: 'Nueva' } as any);

    expect(gradingScaleGrpc.assignEventGradingScale).not.toHaveBeenCalled();
    expect(eventGrpc.updateEvent).toHaveBeenCalledWith({ id: 9, name: 'Nueva' });
    expect((result.event as any).gradingScale).toEqual(finalProjects);
  });

  it('returns the event with a null scale when evaluation-service cannot give it', async () => {
    const { service, gradingScaleGrpc } = build();
    gradingScaleGrpc.getEventGradingScale.mockReturnValue(throwError(() => new Error('unavailable')) as any);

    const result = await service.get({ id: 9 } as any);

    expect((result.event as any).gradingScale).toBeNull();
    expect((result.event as any).name).toBe('Feria');
  });
});

describe('GradingScaleDto', () => {
  const check = (body: unknown) => validate(plainToInstance(GradingScaleDto, body));

  it('accepts 4 levels', async () => {
    expect(
      await check({
        name: 'Decenas',
        levels: [10, 20, 30, 40].map((points, index) => ({ level: index + 1, label: 'L', points })),
      }),
    ).toHaveLength(0);
  });

  it('rejects a scale without exactly 4 levels', async () => {
    const errors = await check({ name: 'X', levels: [{ level: 1, label: 'L', points: 1 }] });

    expect(JSON.stringify(errors)).toContain('exactly 4 levels');
  });

  it('rejects a level outside 1-4, an empty label and points with 3 decimals', async () => {
    const errors = await check({
      name: 'X',
      levels: [
        { level: 5, label: 'L', points: 1 },
        { level: 2, label: '', points: 2 },
        { level: 3, label: 'L', points: 3.001 },
        { level: 4, label: 'L', points: 4 },
      ],
    });

    const text = JSON.stringify(errors);
    expect(text).toContain('level must not be greater than 4');
    expect(text).toContain('label should not be empty');
    expect(text).toContain('points');
  });
});
