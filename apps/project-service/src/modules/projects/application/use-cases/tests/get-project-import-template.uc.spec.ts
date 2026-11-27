import { status } from '@grpc/grpc-js';
import { GetProjectImportTemplateUC } from '../get-project-import-template.uc';
import { EventServicePort } from '../../ports/event-service.port';
import { NotFoundError } from '../../../domain/errors';

describe('GetProjectImportTemplateUC', () => {
  const build = (event: Record<string, unknown>) => {
    const events = {
      getEventById: jest.fn(() => Promise.resolve(event)),
      listCategoriesByEvent: jest.fn(() =>
        Promise.resolve([
          { id: 2, name: 'Ingeniería Industrial', active: true },
          { id: 3, name: 'Categoría retirada', active: false },
          { id: 1, name: 'Arquitectura', active: true },
        ]),
      ),
    };
    return {
      events,
      uc: new GetProjectImportTemplateUC(events as unknown as EventServicePort),
    };
  };

  it('answers the event name, its active categories by name and that the NRC is required', async () => {
    const { uc } = build({ id: 9, name: 'Feria 2026', requiresCourse: true });

    await expect(uc.execute({ eventId: 9 })).resolves.toEqual({
      eventName: 'Feria 2026',
      categoryNames: ['Arquitectura', 'Ingeniería Industrial'],
      requiresCourse: true,
    });
  });

  it('does not require the NRC only when the event says so', async () => {
    const { uc } = build({ id: 9, name: 'Feria', requiresCourse: false });

    await expect(uc.execute({ eventId: 9 })).resolves.toMatchObject({
      requiresCourse: false,
    });
  });

  it('fails with NotFoundError when the event does not exist', async () => {
    const { uc, events } = build({});
    events.getEventById.mockRejectedValue({ code: status.NOT_FOUND });

    await expect(uc.execute({ eventId: 9 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
