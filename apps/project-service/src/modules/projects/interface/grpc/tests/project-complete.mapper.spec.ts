import { toProtoProjectComplete, toProtoProjectInScope } from '../mappers';

/** CU-86e3vmz0n: GetProjectComplete carries the course section for the admin panel */
describe('Course section of the complete project', () => {
  const project = {
    id: 12,
    eventId: 4,
    courseId: 7,
    name: 'P',
    state: 'APPROVED',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-02T00:00:00Z'),
  };
  const academicCourse = {
    id: 8,
    nrc: '1234',
    termId: 2,
    name: 'Ingeniería de software',
    professorUserId: 40,
    departmentId: 3,
    departmentName: 'Sistemas',
  };

  it('maps the course section of the project', () => {
    expect(
      toProtoProjectComplete({ ...project, academicCourse }).academicCourse,
    ).toEqual(academicCourse);
  });

  it('leaves it unset for a project without one (fill rows come as null)', () => {
    expect(
      toProtoProjectComplete({ ...project, academicCourse: null })
        .academicCourse,
    ).toBeUndefined();
  });

  it('keeps it in the academic read, with the assigned jurors', () => {
    const proto = toProtoProjectInScope({
      ...project,
      academicCourse,
      assignedJurorCount: 2,
    });
    expect(proto.academicCourse).toEqual(academicCourse);
    expect(proto.assignedJurorCount).toBe(2);
  });
});
