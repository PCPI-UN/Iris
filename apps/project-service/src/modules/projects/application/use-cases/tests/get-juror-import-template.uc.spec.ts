import { status } from '@grpc/grpc-js';
import { GetJurorImportTemplateUC } from '../get-juror-import-template.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { EventServicePort } from '../../ports/event-service.port';
import { AuthServicePort } from '../../ports/auth-service.port';
import { NotFoundError } from '../../../domain/errors';
import {
  ProjectState,
  ProjectWithJurorIds,
} from '../../../domain/entities/project.entity';

const EVENT_ID = 10;
const CIVIL = 'Dpt. Ingeniería Civil y Ambiental';
const INDUSTRIAL = 'Dpt. Ingeniería Industrial';
const ELECTRICA = 'Dpt. Ingeniería Eléctrica';

const project = (
  id: number,
  courseId: number,
  projectCode: string | null,
  state: ProjectState = 'APPROVED',
): ProjectWithJurorIds => ({
  id,
  eventId: EVENT_ID,
  courseId,
  projectCode,
  name: `Proyecto ${id}`,
  state,
  jurorUserIds: [],
});

describe('GetJurorImportTemplateUC', () => {
  let repo: {
    listWithJurorsByEvent: jest.Mock;
    listParticipants: jest.Mock;
    listPendingParticipants: jest.Mock;
    listTutorLinksByProjects: jest.Mock;
    listPendingTutorsByProjects: jest.Mock;
  };
  let auth: { findUsersByIds: jest.Mock };
  let events: { getEventById: jest.Mock; listCategoriesByEvent: jest.Mock };
  let useCase: GetJurorImportTemplateUC;

  beforeEach(() => {
    repo = {
      listWithJurorsByEvent: jest
        .fn()
        .mockResolvedValue([
          project(1, 2, '14'),
          project(2, 1, '10'),
          project(3, 1, '2'),
          project(4, 1, null),
          project(5, 1, '7', 'UNDER_REVIEW'),
          project(6, 1, '8', 'REJECTED'),
          project(7, 99, '3'),
        ]),
      listParticipants: jest.fn((projectId: number) =>
        Promise.resolve(
          projectId === 3
            ? [
                { projectId, userId: 21, studentCode: 'a' },
                { projectId, userId: 22, studentCode: 'b' },
              ]
            : [],
        ),
      ),
      listPendingParticipants: jest.fn((projectId: number) =>
        Promise.resolve(
          projectId === 3
            ? [{ projectId, firstName: 'Luis', lastName: null }]
            : projectId === 2
              ? [{ projectId, firstName: 'Marta', lastName: 'Gómez' }]
              : [],
        ),
      ),
      listTutorLinksByProjects: jest
        .fn()
        .mockResolvedValue([{ projectId: 3, userId: 31 }]),
      listPendingTutorsByProjects: jest.fn().mockResolvedValue([
        {
          projectId: 3,
          firstName: 'Rosa',
          lastName: 'Gil',
          email: 'rosa@x.co',
          status: 'INVITED',
        },
        {
          projectId: 2,
          firstName: 'Tomás',
          lastName: null,
          email: 'tomas@x.co',
          status: 'PENDING',
        },
        // already JOINED: it is in the linked list, not repeated
        {
          projectId: 3,
          firstName: 'Tutor',
          lastName: 'Unido',
          email: 'unido@x.co',
          status: 'JOINED',
        },
      ]),
    };
    auth = {
      findUsersByIds: jest.fn((ids: number[]) =>
        Promise.resolve(
          [
            { id: 21, firstName: 'Ana', lastName: 'Pérez', email: 'a@x.co' },
            { id: 22, firstName: 'Carlos', email: 'c@x.co' },
            { id: 31, firstName: 'Elena', lastName: 'Ruiz', email: 'e@x.co' },
          ].filter((u) => ids.includes(u.id)),
        ),
      ),
    };
    events = {
      getEventById: jest.fn().mockResolvedValue({
        id: EVENT_ID,
        name: '202610 - Feria de Proyectos Finales',
      }),
      listCategoriesByEvent: jest.fn().mockResolvedValue([
        { id: 2, name: INDUSTRIAL, active: true },
        { id: 1, name: CIVIL, active: true },
        { id: 3, name: ELECTRICA, active: false },
      ]),
    };
    useCase = new GetJurorImportTemplateUC(
      repo as unknown as ProjectRepository,
      events as unknown as EventServicePort,
      auth as unknown as AuthServicePort,
    );
  });

  it('returns the approved projects of the event with their participants', async () => {
    const template = await useCase.execute({ eventId: EVENT_ID });

    expect(template.eventName).toBe('202610 - Feria de Proyectos Finales');
    expect(template.projects).toEqual([
      // a project whose category is not in the event keeps an empty department
      {
        projectId: 7,
        department: '',
        projectCode: '3',
        name: 'Proyecto 7',
        members: [],
        tutors: [],
        tutorEmails: [],
      },
      {
        projectId: 3,
        department: CIVIL,
        projectCode: '2',
        name: 'Proyecto 3',
        // confirmed participants first (names from auth), then the pending one
        members: ['Ana Pérez', 'Carlos', 'Luis'],
        // linked tutors first (email from auth), then the pending one
        tutors: ['Elena Ruiz', 'Rosa Gil'],
        tutorEmails: ['e@x.co', 'rosa@x.co'],
      },
      {
        projectId: 2,
        department: CIVIL,
        projectCode: '10',
        name: 'Proyecto 2',
        members: ['Marta Gómez'],
        tutors: ['Tomás'],
        tutorEmails: ['tomas@x.co'],
      },
      // approved without number: listed last in its department
      {
        projectId: 4,
        department: CIVIL,
        projectCode: '',
        name: 'Proyecto 4',
        members: [],
        tutors: [],
        tutorEmails: [],
      },
      {
        projectId: 1,
        department: INDUSTRIAL,
        projectCode: '14',
        name: 'Proyecto 1',
        members: [],
        tutors: [],
        tutorEmails: [],
      },
    ]);
  });

  it('only asks auth-service for the confirmed participants of approved projects', async () => {
    await useCase.execute({ eventId: EVENT_ID });

    expect(auth.findUsersByIds).toHaveBeenCalledWith([21, 22]);
    expect(repo.listParticipants).not.toHaveBeenCalledWith(5);
  });

  it('fails with NotFoundError when the event does not exist', async () => {
    events.getEventById.mockRejectedValue({ code: status.NOT_FOUND });

    await expect(useCase.execute({ eventId: EVENT_ID })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
