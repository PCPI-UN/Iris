import { AssignJurorBulkUC } from '../assign-juror-bulk.uc';
import { ReassignProjectJurorUC } from '../reassign-project-juror.uc';
import { NotFoundError } from '../../../domain/errors';
import {
  JUROR_ROLE_ID,
  JurorKey,
} from '../../../domain/entities/project.entity';

/**
 * In-memory repository that keys assignments like the real table does:
 * (projectId, userId, eventId, roleId), so a key built with the wrong role
 * does not match the stored row.
 */
class InMemoryAssignments {
  private rows = new Map<string, JurorKey & { projectId: number }>();

  constructor(private readonly projects: { id: number; eventId: number }[]) {}

  private key(projectId: number, j: JurorKey) {
    return [projectId, j.memberUserId, j.memberEventId, j.memberRoleId].join(
      ':',
    );
  }

  findById = async (id: number) =>
    this.projects.find((p) => p.id === id) ?? null;

  findManyByIds = async (ids: number[]) =>
    this.projects.filter((p) => ids.includes(p.id));

  upsertAssignment = async (projectId: number, j: JurorKey) => {
    this.rows.set(this.key(projectId, j), { projectId, ...j });
  };

  bulkUpsertAssignments = async (projectIds: number[], j: JurorKey) => {
    for (const id of projectIds) await this.upsertAssignment(id, j);
  };

  removeAssignment = async (projectId: number, j: JurorKey) =>
    this.rows.delete(this.key(projectId, j));

  listAssignments = async (projectId: number): Promise<JurorKey[]> =>
    [...this.rows.values()]
      .filter((r) => r.projectId === projectId)
      .map(({ memberUserId, memberEventId, memberRoleId }) => ({
        memberUserId,
        memberEventId,
        memberRoleId,
      }));
}

describe('ReassignProjectJurorUC', () => {
  const EVENT_ID = 7;
  let repo: InMemoryAssignments;
  let assign: AssignJurorBulkUC;
  let reassign: ReassignProjectJurorUC;

  beforeEach(async () => {
    repo = new InMemoryAssignments([{ id: 1, eventId: EVENT_ID }]);
    assign = new AssignJurorBulkUC(repo as any);
    reassign = new ReassignProjectJurorUC(repo as any);
    await assign.execute({ userId: 10, projectIds: [1] });
  });

  it('leaves the project with only the new juror, with the juror role', async () => {
    const res = await reassign.execute({
      projectId: 1,
      fromUserId: 10,
      toUserId: 20,
    });

    expect(res).toEqual({ ok: true, changed: true });
    expect(await repo.listAssignments(1)).toEqual([
      {
        memberUserId: 20,
        memberEventId: EVENT_ID,
        memberRoleId: JUROR_ROLE_ID,
      },
    ]);
  });

  it('does nothing when the juror is the same', async () => {
    const res = await reassign.execute({
      projectId: 1,
      fromUserId: 10,
      toUserId: 10,
    });

    expect(res).toEqual({ ok: true, changed: false });
    expect(await repo.listAssignments(1)).toHaveLength(1);
  });

  it('does not duplicate when the new juror was already assigned', async () => {
    await assign.execute({ userId: 20, projectIds: [1] });

    await reassign.execute({ projectId: 1, fromUserId: 10, toUserId: 20 });

    const jurors = await repo.listAssignments(1);
    expect(jurors.map((j) => j.memberUserId)).toEqual([20]);
  });

  it('throws when the project does not exist', async () => {
    await expect(
      reassign.execute({ projectId: 99, fromUserId: 10, toUserId: 20 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
