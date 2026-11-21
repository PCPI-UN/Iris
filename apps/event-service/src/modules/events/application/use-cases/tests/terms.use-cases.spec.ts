import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CreateTermUC } from '../create-term.uc';
import { ListTermsUC } from '../list-terms.uc';
import { CreateEventUC } from '../create-event.uc';
import { UpdateEventUC } from '../update-event.uc';
import { NO_TERM_ID, Term } from '../../../domain/entities/term.entity';

const rpcCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    return ((error as RpcException).getError() as { code: number }).code;
  }
  throw new Error('expected an RpcException');
};

const termRepo = () => ({
  create: jest.fn(async (data: { year: number; period: string }) => new Term(3, data.year, data.period)),
  findById: jest.fn(async (id: number) =>
    id === NO_TERM_ID ? new Term(NO_TERM_ID, -1, '-1') : id === 3 ? new Term(3, 2026, '10') : null,
  ),
  findByYearAndPeriod: jest.fn().mockResolvedValue(null),
  listSelectable: jest.fn().mockResolvedValue([new Term(3, 2026, '10')]),
});

describe('academic terms', () => {
  it('ListTermsUC lists the selectable terms', async () => {
    const terms = termRepo();
    await expect(new ListTermsUC(terms as any).execute()).resolves.toEqual([new Term(3, 2026, '10')]);
  });

  it('CreateTermUC creates a new (year, period)', async () => {
    const terms = termRepo();
    await expect(new CreateTermUC(terms as any).execute({ year: 2026, period: ' 20 ' })).resolves.toMatchObject({
      year: 2026,
      period: '20',
    });
    expect(terms.create).toHaveBeenCalledWith({ year: 2026, period: '20' });
  });

  it('CreateTermUC rejects a repeated (year, period)', async () => {
    const terms = termRepo();
    terms.findByYearAndPeriod.mockResolvedValue(new Term(3, 2026, '10'));

    expect(await rpcCode(new CreateTermUC(terms as any).execute({ year: 2026, period: '10' }))).toBe(
      status.ALREADY_EXISTS,
    );
    expect(terms.create).not.toHaveBeenCalled();
  });
});

describe('term of an event', () => {
  const dates = {
    inscriptionDeadline: '2026-11-01T08:00:00',
    startDate: '2026-11-10T08:00:00',
    endDate: '2026-11-11T08:00:00',
  };
  let events: any;
  let terms: ReturnType<typeof termRepo>;

  beforeEach(() => {
    events = {
      findByAccessCode: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({ id: 7, accessCode: 'EXPO', termId: NO_TERM_ID, ...dates }),
      create: jest.fn(async (data) => ({ id: 7, ...data })),
      update: jest.fn(async (id, data) => ({ id, ...data })),
    };
    terms = termRepo();
  });

  const create = (termId: number) =>
    new CreateEventUC(events, terms as any).execute({
      name: 'Expo', accessCode: 'EXPO', termId, requiresCourse: false, ...dates,
    } as any);
  const update = (input: Record<string, unknown>) =>
    new UpdateEventUC(events, terms as any).execute({ id: 7, ...input } as any);

  it('creates the event with an existing term and whether it requires a course section', async () => {
    await create(3);
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ termId: 3, requiresCourse: false }));
  });

  it('changes whether the event requires a course section only when it is sent', async () => {
    await update({ requiresCourse: false });
    expect(events.update).toHaveBeenCalledWith(7, expect.objectContaining({ requiresCourse: false }));

    await update({ name: 'Otra' });
    expect(events.update).toHaveBeenLastCalledWith(7, expect.objectContaining({ requiresCourse: undefined }));
  });

  it('rejects the "no term" row and a missing term on create', async () => {
    expect(await rpcCode(create(NO_TERM_ID))).toBe(status.INVALID_ARGUMENT);
    expect(await rpcCode(create(99))).toBe(status.NOT_FOUND);
    expect(events.create).not.toHaveBeenCalled();
  });

  it('edits an event still on the "no term" row without asking for a term', async () => {
    await update({ resultsPublished: true });
    expect(terms.findById).not.toHaveBeenCalled();
    expect(events.update).toHaveBeenCalledWith(7, expect.objectContaining({ termId: undefined }));
  });

  it('moves an event to an existing term, but not to the "no term" row', async () => {
    await update({ termId: 3 });
    expect(events.update).toHaveBeenCalledWith(7, expect.objectContaining({ termId: 3 }));

    events.update.mockClear();
    expect(await rpcCode(update({ termId: NO_TERM_ID }))).toBe(status.INVALID_ARGUMENT);
    expect(await rpcCode(update({ termId: 99 }))).toBe(status.NOT_FOUND);
    expect(events.update).not.toHaveBeenCalled();
  });
});
