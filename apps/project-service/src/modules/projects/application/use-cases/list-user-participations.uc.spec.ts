import { ListUserParticipationsUC } from './list-user-participations.uc';
import { UserParticipation } from '../../domain/entities/project.entity';

describe('ListUserParticipationsUC', () => {
  const participation = (
    id: number,
    studentCode: string,
    career: string | null,
    semester: string | null,
  ): UserParticipation => ({
    project: { id, eventId: 1, courseId: 1, name: `Project ${id}`, state: 'APPROVED' },
    studentCode,
    career,
    semester,
  });

  const build = (rows: UserParticipation[]) => {
    const repo = { listParticipationsByUser: jest.fn(async () => rows) };
    return { uc: new ListUserParticipationsUC(repo as any), repo };
  };

  it('looks the participations up by user and email', async () => {
    const { uc, repo } = build([]);

    await uc.execute({ userId: 7, email: 'laura@test.local' });

    expect(repo.listParticipationsByUser).toHaveBeenCalledWith(7, 'laura@test.local');
  });

  it('derives each academic field from the most recent informative value', async () => {
    const { uc } = build([
      participation(9, '2021001001', 'N/A', '8'),
      participation(5, '2019001001', 'Ingeniería Industrial', '3'),
    ]);

    const result = await uc.execute({ userId: 7, email: 'laura@test.local' });

    expect(result.academic).toEqual({
      studentCode: '2021001001',
      career: 'Ingeniería Industrial',
      semester: '8',
    });
  });

  it('returns null academic fields when there is no informative value', async () => {
    const { uc } = build([participation(9, '2021001001', '', null)]);

    const result = await uc.execute({ userId: 7, email: 'laura@test.local' });

    expect(result.academic).toEqual({ studentCode: '2021001001', career: null, semester: null });
  });

  it('limits the participations but derives from all of them and reports the total', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => participation(10 - i, `C${i}`, null, null));
    rows[3].career = 'Ingeniería de Sistemas';
    const { uc } = build(rows);

    const result = await uc.execute({ userId: 7, email: 'laura@test.local', limit: 2 });

    expect(result.participations.map((p) => p.project.id)).toEqual([10, 9]);
    expect(result.total).toBe(4);
    expect(result.academic.career).toBe('Ingeniería de Sistemas');
  });

  it.each([
    [undefined, 10],
    [0, 10],
    [500, 50],
  ])('applies limit %p as %p', async (limit, expected) => {
    const rows = Array.from({ length: 60 }, (_, i) => participation(i + 1, `C${i}`, null, null));
    const { uc } = build(rows);

    const result = await uc.execute({ userId: 7, email: 'laura@test.local', limit });

    expect(result.participations).toHaveLength(expected);
  });
});
