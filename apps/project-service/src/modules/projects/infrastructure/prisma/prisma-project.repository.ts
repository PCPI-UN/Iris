import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { normalizeEmail } from '@app/common/utils/email.util';
import {
  AcademicCourseView,
  ProjectRepository,
  ProjectInScope,
} from '../../domain/repositories/project.repository';
import { ProjectReadScope } from '../../domain/read-scope';
import { PendingProjectParticipant, PendingProjectTutor, PendingProjectTutorInput, Project, TypedDocument } from '../../domain/entities/project.entity';
import { ProjectDocument, ProjectState, JurorKey, ProjectParticipant, UserParticipation, ProjectWithJurorIds, JUROR_ROLE_ID, isFillAcademicCourse } from '../../domain/entities/project.entity';
import {
  ProjectChangedMeanwhileError,
  ProjectNameTakenError,
} from '../../domain/admin-project-edit';

/** The unique index of a P2002 covers the field (target is the column list or the index name). */
const uniqueTargetIncludes = (
  error: Prisma.PrismaClientKnownRequestError,
  field: string,
): boolean => {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === 'string' && target.includes(field);
};


type CreateProjectInput = {
  eventId: number;
  courseId: number;
  name: string;
  projectCode?: string;
  description?: string;
  eventNumber?: string;
  state: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
  academicCourseId: number;
};

type AddPendingParticipantInput = {
  projectId: number;
  firstName: string;
  lastName?: string | null;
  email: string;
  studentCode: string;
  semester: string;
  career: string;
  status: 'PENDING' | 'INVITED' | 'JOINED';
};

/** Relations loaded for the academic read endpoints. */
const IN_SCOPE_INCLUDE = {
  participants: true,
  pendingParticipants: true,
  documents: true,
  academicCourse: { include: { department: { select: { name: true } } } },
  _count: { select: { jurorsAssigned: true } },
} as const;

/**
 * Prisma filter of the projects inside a read scope; undefined means every project.
 * The relations granted by the user's permissions are OR-ed, so a user with several reads the union.
 */
export function scopeWhere(scope: ProjectReadScope): Prisma.ProjectWhereInput | undefined {
  if (scope.all) return undefined;
  const or: Prisma.ProjectWhereInput[] = [];
  if (scope.tutored) or.push({ tutors: { some: { userId: scope.userId } } });
  if (scope.ofCourses) or.push({ academicCourse: { is: { professorUserId: scope.userId } } });
  if (scope.ofDepartment) {
    or.push({ academicCourse: { is: { department: { is: { directorUserId: scope.userId } } } } });
  }
  // A scope with no relation reads nothing; resolveReadScope never builds one, but stay closed
  return { OR: or.length ? or : [{ id: -1 }] };
}

function toProjectInScope(row: any): ProjectInScope {
  const { academicCourse, _count, ...project } = row;
  return {
    ...project,
    assignedJurorCount: _count?.jurorsAssigned ?? 0,
    // Course sections -1 and 0 are fill rows, not real NRCs
    academicCourse: academicCourse && !isFillAcademicCourse(academicCourse.id)
      ? {
          id: academicCourse.id,
          nrc: academicCourse.nrc,
          termId: academicCourse.termId,
          name: academicCourse.name,
          professorUserId: academicCourse.professorUserId,
          departmentId: academicCourse.departmentId,
          departmentName: academicCourse.department.name,
        }
      : null,
  };
}

type ListOpts = { courseId?: number; q?: string; currentPage?: number; itemsPerPage?: number; state?: ProjectState };

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(data: CreateProjectInput): Promise<Project> {
    return this.prisma.db.project.create({
      data: {
        eventId: data.eventId,
        courseId: data.courseId,
        name: data.name,
        projectCode: data.projectCode ?? null,
        description: data.description ?? null,
        eventNumber: data.eventNumber ?? null,
        state: data.state,
        academicCourseId: data.academicCourseId,
      },
    }) as unknown as Project;
  }

  async findAcademicCourseId(termId: number, nrc: string): Promise<number | null> {
    const course = await this.prisma.db.academicCourse.findUnique({
      where: { termId_nrc: { termId, nrc } },
      select: { id: true },
    });
    return course?.id ?? null;
  }

  async listAcademicCoursesByTerm(
    termId: number,
  ): Promise<AcademicCourseView[]> {
    const courses = await this.prisma.db.academicCourse.findMany({
      // The fill rows (-1, 0) belong to term -1, but they are left out by id as well
      where: { termId, id: { gt: 0 } },
      orderBy: { nrc: 'asc' },
      include: { department: { select: { name: true } } },
    });
    return courses.map((course) => ({
      id: course.id,
      nrc: course.nrc,
      termId: course.termId,
      name: course.name,
      professorUserId: course.professorUserId,
      departmentId: course.departmentId,
      departmentName: course.department.name,
    }));
  }

  async findById(id: number): Promise<Project | null> {
    return (await this.prisma.db.project.findUnique({ where: { id } })) as unknown as Project | null;
  }

  async findManyByIds(ids: number[]): Promise<Project[]> {
    if (!ids.length) return [];
    return (await this.prisma.db.project.findMany({ where: { id: { in: ids } } })) as unknown as Project[];
  }

  async findProject(eventId: number, courseId: number, name: string): Promise<Project | null> {
    return (await this.prisma.db.project.findFirst({
      where: { eventId, courseId, name },
    })) as unknown as Project | null;
  }

  async findProjectWithEvent(projectId: number): Promise<Project | null> {
    return this.prisma.db.project.findUnique({
      where: { id: projectId },
    });
  }

  async listByFilter(eventId: number, opts?: ListOpts): Promise<{ items: Project[]; total: number, currentPage: number; itemsPerPage: number }> {
    const currentPage = opts?.currentPage && opts.currentPage > 0 ? opts.currentPage : 1;
    const itemsPerPage = opts?.itemsPerPage && opts.itemsPerPage > 0 ? opts.itemsPerPage : 10;
    const where: any = {
      eventId,
      ...(opts?.courseId ? { courseId: opts.courseId } : {}),
      ...(opts?.q ? { name: { contains: opts.q, mode: 'insensitive' as const } } : {}),
      ...(opts?.state ? { state: opts.state } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.project.findMany({
        where,
        orderBy: { createdAt: 'desc' }, // camelCase
        skip: (currentPage - 1) * itemsPerPage,
        take: itemsPerPage,
        include: {
          participants: true,
          documents: true,
          pendingParticipants: true,
        },
      }),
      this.prisma.db.project.count({ where }),
    ]);

    return { items: items as unknown as Project[], total, currentPage, itemsPerPage };
  }

  async countAll(): Promise<number> {
    return this.prisma.db.project.count();
  }

  async findByEventAndName(eventId: number, name: string): Promise<Project | null> {
    return (await this.prisma.db.project.findUnique({
      where: { eventId_name: { eventId, name } },
    })) as unknown as Project | null;
  }

  async updateProject(
    input: {
      id: number;
      name?: string;
      projectCode?: string | null;
      description?: string | null;
      eventNumber?: string | null;
      courseId?: number;
    },
    ifCurrent?: {
      name?: string;
      projectCode?: string | null;
      description?: string | null;
      eventNumber?: string | null;
      courseId?: number;
    },
  ): Promise<Project> {
    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.projectCode !== undefined) data.projectCode = input.projectCode;
    if (input.description !== undefined) data.description = input.description;
    if (input.eventNumber !== undefined) data.eventNumber = input.eventNumber;
    if (input.courseId !== undefined) data.courseId = input.courseId;

    try {
      if (!ifCurrent) {
        return (await this.prisma.db.project.update({
          where: { id: input.id },
          data,
        })) as unknown as Project;
      }
      // Optimistic check: the fields must still hold the values that were read
      const expected = Object.fromEntries(
        Object.entries(ifCurrent).filter(([, value]) => value !== undefined),
      ) as Prisma.ProjectWhereInput;
      const { count } = await this.prisma.db.project.updateMany({
        where: { ...expected, id: input.id },
        data,
      });
      if (!count) throw new ProjectChangedMeanwhileError();
      return (await this.prisma.db.project.findUnique({
        where: { id: input.id },
      })) as unknown as Project;
    } catch (error) {
      // Another project of the event took the name after it was checked (@@unique([eventId, name]))
      if (
        input.name !== undefined &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        uniqueTargetIncludes(error, 'name')
      ) {
        throw new ProjectNameTakenError(input.name);
      }
      throw error;
    }
  }

  async setProjectState(id: number, state: ProjectState): Promise<Project> {
    return (await this.prisma.db.project.update({
      where: { id },
      data: { state },
    })) as unknown as Project;
  }

  async setProjectStateWithReason(id: number, state: ProjectState, reason?: string): Promise<Project> {
    return (await this.prisma.db.project.update({
      where: { id },
      data: {
        state,
        reason: reason,
      },
    })) as unknown as Project;
  }

  async changeStateIfCurrent(
    id: number,
    from: ProjectState,
    to: ProjectState,
    reason: string | null,
  ): Promise<Project | null> {
    const { count } = await this.prisma.db.project.updateMany({
      where: { id, state: from },
      data: { state: to, reason },
    });
    if (!count) return null;
    return this.prisma.db.project.findUnique({ where: { id } });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.db.project.delete({ where: { id } });
  }

  async addDocument(projectId: number, url: string, type: TypedDocument): Promise<ProjectDocument> {

    return (await this.prisma.db.projectDocument.create({
      data: { projectId, url, type },
    })) as unknown as ProjectDocument;
  }

  async listDocuments(projectId: number): Promise<ProjectDocument[]> {
    return (await this.prisma.db.projectDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })) as unknown as ProjectDocument[];
  }

  async upsertAssignment(projectId: number, juror: JurorKey): Promise<void> {
    await this.prisma.db.projectAssignment.upsert({
      where: {
        projectId_memberUserId_memberEventId_memberRoleId: {
          projectId,
          memberUserId: juror.memberUserId,
          memberEventId: juror.memberEventId,
          memberRoleId: juror.memberRoleId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        projectId,
        memberUserId: juror.memberUserId,
        memberEventId: juror.memberEventId,
        memberRoleId: juror.memberRoleId,
      },
    });
  }

  async bulkUpsertAssignments(projectIds: number[], juror: JurorKey): Promise<void> {
    const data = projectIds.map(projectId => ({
      projectId,
      memberUserId: juror.memberUserId,
      memberEventId: juror.memberEventId,
      memberRoleId: juror.memberRoleId,
    }));

    await this.prisma.db.projectAssignment.createMany({
      data,
      skipDuplicates: true, // Skip if assignment already exists for efficient insertion!
    });
  }

  async createAssignments(
    assignments: { projectId: number; juror: JurorKey }[],
  ): Promise<number> {
    if (!assignments.length) return 0;
    // One INSERT: all the assignments are written or none
    const { count } = await this.prisma.db.projectAssignment.createMany({
      data: assignments.map(({ projectId, juror }) => ({
        projectId,
        memberUserId: juror.memberUserId,
        memberEventId: juror.memberEventId,
        memberRoleId: juror.memberRoleId,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  async removeAssignment(projectId: number, juror: JurorKey): Promise<boolean> {
    const res = await this.prisma.db.projectAssignment.deleteMany({
      where: {
        projectId,
        memberUserId: juror.memberUserId,
        memberEventId: juror.memberEventId,
        memberRoleId: juror.memberRoleId,
      },
    });
    return res.count > 0;
  }

  async listAssignments(projectId: number): Promise<JurorKey[]> {
    const rows = await this.prisma.db.projectAssignment.findMany({
      where: { projectId },
      select: { memberUserId: true, memberEventId: true, memberRoleId: true },
      orderBy: [{ memberUserId: 'asc' }, { memberRoleId: 'asc' }],
    });
    return rows.map((r: { memberUserId: number; memberEventId: number; memberRoleId: number }) => ({
      memberUserId: r.memberUserId,
      memberEventId: r.memberEventId,
      memberRoleId: r.memberRoleId,
    }));
  }

  isUserParticipant(projectId: number, userId: number): Promise<boolean> {
    return this.prisma.db.projectParticipant.count({
      where: { projectId, userId },
    }).then(count => count > 0);
  }

  async addParticipant(input: { projectId: number; userId: number; studentCode: string }): Promise<ProjectParticipant> {
    // Idempotente: si ya existe (PK compuesta), actualiza solo studentCode cuando venga
    return (await this.prisma.db.projectParticipant.upsert({
      where: {
        userId_projectId: { userId: input.userId, projectId: input.projectId }, // Prisma crea este where único por la PK compuesta
      },
      update: {
        studentCode: input.studentCode,
      },
      create: {
        userId: input.userId,
        projectId: input.projectId,
        studentCode: input.studentCode,
      },
    })) as unknown as ProjectParticipant;
  }

  async listParticipants(projectId: number): Promise<ProjectParticipant[]> {
    return (await this.prisma.db.projectParticipant.findMany({
      where: { projectId },
      orderBy: { userId: 'asc' },
      select: { userId: true, projectId: true, studentCode: true },
    })) as unknown as ProjectParticipant[];
  }

  async addPendingParticipant(input: AddPendingParticipantInput): Promise<PendingProjectParticipant> {
    const existing = await this.prisma.db.pendingProjectParticipant.findFirst({
      where: {
        projectId: input.projectId,
        email: input.email,
      },
    });
    // console.log('Existing pending participant:', existing);
    // console.log('Input data:', input);
    if (existing) {
      // Actualizar
      return this.prisma.db.pendingProjectParticipant.update({
        where: { pendingId: existing.pendingId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          studentCode: input.studentCode,
          semester: input.semester,
          career: input.career,
          status: input.status,
        },
      });
    } else {
      // Crear
      return this.prisma.db.pendingProjectParticipant.create({
        data: {
          projectId: input.projectId,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          email: input.email,
          studentCode: input.studentCode ?? null,
          semester: input.semester,
          career: input.career,
          status: input.status,
        },
      });
    }
  }

  async listPendingParticipants(projectId: number): Promise<PendingProjectParticipant[]> {
    return (await this.prisma.db.pendingProjectParticipant.findMany({
      where: { projectId },
      orderBy: { firstName: 'asc' },
    })) as unknown as PendingProjectParticipant[];
  }

  async markPendingsInvited(projectId: number, emails: string[], invitedAt: Date) {
    if (!emails.length) return 0;
    const res = await this.prisma.db.pendingProjectParticipant.updateMany({
      where: {
        projectId,
        email: { in: emails.map(normalizeEmail) },
      },
      data: {
        status: 'INVITED',
        invitedAt,
      },
    });
    return res.count; // cuántos registros actualizó
  }

  async removeParticipant(projectId: number, userId: number): Promise<boolean> {
    const res = await this.prisma.db.projectParticipant.deleteMany({
      where: { projectId, userId },
    });
    return res.count > 0;
  }

  async removePendingParticipants(
    projectId: number,
    pendingIds: number[],
  ): Promise<number> {
    if (!pendingIds.length) return 0;
    const res = await this.prisma.db.pendingProjectParticipant.deleteMany({
      where: { projectId, pendingId: { in: pendingIds } },
    });
    return res.count;
  }

  async lockProject(projectId: number): Promise<void> {
    await this.prisma.db
      .$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
  }

  async addTutor(projectId: number, userId: number): Promise<void> {
    await this.prisma.db.projectTutor.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {},
      create: { projectId, userId },
    });
  }

  async listTutorUserIds(projectId: number): Promise<number[]> {
    const rows = await this.prisma.db.projectTutor.findMany({
      where: { projectId },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.userId);
  }

  async replaceTutors(projectId: number, userIds: number[], pendings: PendingProjectTutorInput[]): Promise<void> {
    const normalized = pendings.map((p) => ({ ...p, email: normalizeEmail(p.email) }));
    await this.prisma.transaction(async (tx) => {
      await tx.projectTutor.deleteMany({ where: { projectId, userId: { notIn: userIds } } });
      await tx.projectTutor.createMany({
        data: userIds.map((userId) => ({ projectId, userId })),
        skipDuplicates: true,
      });
      await tx.pendingProjectTutor.deleteMany({
        where: { projectId, email: { notIn: normalized.map((p) => p.email) } },
      });
      for (const p of normalized) {
        await tx.pendingProjectTutor.upsert({
          where: { projectId_email: { projectId, email: p.email } },
          update: { firstName: p.firstName, lastName: p.lastName ?? null },
          create: { projectId, email: p.email, firstName: p.firstName, lastName: p.lastName ?? null },
        });
      }
    });
  }

  async addPendingTutor(projectId: number, input: PendingProjectTutorInput): Promise<PendingProjectTutor> {
    const email = normalizeEmail(input.email);
    const row = await this.prisma.db.pendingProjectTutor.upsert({
      where: { projectId_email: { projectId, email } },
      update: { firstName: input.firstName, lastName: input.lastName ?? null },
      create: { projectId, email, firstName: input.firstName, lastName: input.lastName ?? null },
    });
    return row as unknown as PendingProjectTutor;
  }

  async listPendingTutors(projectId: number): Promise<PendingProjectTutor[]> {
    const rows = await this.prisma.db.pendingProjectTutor.findMany({
      where: { projectId },
      orderBy: { pendingId: 'asc' },
    });
    return rows as unknown as PendingProjectTutor[];
  }

  async listTutorLinksByProjects(projectIds: number[]): Promise<{ projectId: number; userId: number }[]> {
    if (!projectIds.length) return [];
    return this.prisma.db.projectTutor.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, userId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listPendingTutorsByProjects(projectIds: number[]): Promise<PendingProjectTutor[]> {
    if (!projectIds.length) return [];
    const rows = await this.prisma.db.pendingProjectTutor.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { pendingId: 'asc' },
    });
    return rows as unknown as PendingProjectTutor[];
  }

  async markPendingTutorsInvited(projectId: number, emails: string[], invitedAt: Date): Promise<number> {
    if (!emails.length) return 0;
    const res = await this.prisma.db.pendingProjectTutor.updateMany({
      where: { projectId, email: { in: emails.map(normalizeEmail) } },
      data: { status: 'INVITED', invitedAt },
    });
    return res.count;
  }

  async markPendingTutorJoined(projectId: number, email: string, joinedAt: Date): Promise<boolean> {
    const res = await this.prisma.db.pendingProjectTutor.updateMany({
      where: { projectId, email: normalizeEmail(email) },
      data: { status: 'JOINED', joinedAt },
    });
    return res.count > 0;
  }

  async listAssignedToJuror(juror: JurorKey, opts?: { page?: number; pageSize?: number }
  ): Promise<{ items: Project[]; total: number }> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 10;

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.db.project.findMany({
        where: {
          jurorsAssigned: {
            some: {
              memberUserId: juror.memberUserId,
              memberEventId: juror.memberEventId,
              memberRoleId: juror.memberRoleId,
            },
          },
        },
        include: {
          participants: true,
          documents: true,
          pendingParticipants: true,
        },
        skip,
        take: pageSize,
        orderBy: { id: 'asc' },
      }),
      this.prisma.db.project.count({
        where: {
          jurorsAssigned: {
            some: {
              memberUserId: juror.memberUserId,
              memberEventId: juror.memberEventId,
              memberRoleId: juror.memberRoleId,
            },
          },
        },
      }),
    ]);

    return { items, total };
  }

  async markPendingJoined(projectId: number, studentCode: string, joinedAt: Date): Promise<boolean> {
    const res = await this.prisma.db.pendingProjectParticipant.updateMany({
      where: {
        projectId,
        studentCode,
      },
      data: {
        status: 'JOINED',
        joinedAt,
      },
    });
    return res.count > 0;
  }

  async findDocumentById(id: number): Promise<ProjectDocument | null> {
    return (await this.prisma.db.projectDocument.findUnique({
      where: { id },
    })) as unknown as ProjectDocument | null;
  }
  async updateDocument(input: {
    id: number;
    url?: string;
    type?: TypedDocument;
    state?: 'ACTIVE' | 'INACTIVE';
  }): Promise<ProjectDocument> {
    const data: any = {};
    if (input.url !== undefined) data.url = input.url;
    if (input.type !== undefined) data.type = input.type;
    if (input.state !== undefined) data.state = input.state;
    return (await this.prisma.db.projectDocument.update({
      where: { id: input.id },
      data,
    })) as unknown as ProjectDocument;
  }

  async findByEventIdAndUserId(eventId: number, userId: number): Promise<Project | null> {
    const project = await this.prisma.db.project.findFirst({
      where: {
        eventId,
        participants: {
          some: {
            userId,
          },
        },
      },
    });
    return project as unknown as Project | null;
  }

  async listWithJurorsByEvent(eventId: number): Promise<ProjectWithJurorIds[]> {
    const projects = await this.prisma.db.project.findMany({
      where: { eventId },
      include: {
        jurorsAssigned: {
          where: { memberEventId: eventId, memberRoleId: JUROR_ROLE_ID },
          select: { memberUserId: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return projects.map(({ jurorsAssigned, ...project }) => ({
      ...(project as unknown as Project),
      jurorUserIds: jurorsAssigned.map((a) => a.memberUserId),
    }));
  }
  async listParticipationsByUser(userId: number, email: string): Promise<UserParticipation[]> {
    const participations = await this.prisma.db.projectParticipant.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { project: { createdAt: 'desc' } },
    });
    if (!participations.length) return [];

    // career and semester only exist on the pending participant row captured at
    // submission. (project_id, email) is unique there, so each project matches at most one row
    const pendings = await this.prisma.db.pendingProjectParticipant.findMany({
      where: {
        projectId: { in: participations.map(p => p.projectId) },
        email: { equals: email.trim(), mode: 'insensitive' },
      },
      select: { projectId: true, career: true, semester: true },
    });
    const byProject = new Map(pendings.map(p => [p.projectId, p]));

    return participations.map(p => {
      const pending = byProject.get(p.projectId);
      return {
        project: p.project as unknown as Project,
        studentCode: p.studentCode,
        career: pending?.career ?? null,
        semester: pending?.semester ?? null,
      };
    });
  }

  async listProjectsByParticipant(userId: number, states: ProjectState[]): Promise<Project[]> {
    const rows = await this.prisma.db.project.findMany({
      where: {
        participants: { some: { userId } },
        ...(states.length ? { state: { in: states } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows as unknown as Project[];
  }

  async listInScope(
    scope: ProjectReadScope,
    opts: { eventId?: number; state?: ProjectState; academicCourseId?: number; q?: string; currentPage: number; itemsPerPage: number },
  ): Promise<{ items: ProjectInScope[]; total: number }> {
    const filters: Prisma.ProjectWhereInput[] = [];
    const inScope = scopeWhere(scope);
    if (inScope) filters.push(inScope);
    if (opts.eventId) filters.push({ eventId: opts.eventId });
    if (opts.state) filters.push({ state: opts.state });
    if (opts.academicCourseId) filters.push({ academicCourseId: opts.academicCourseId });
    if (opts.q) filters.push({ name: { contains: opts.q, mode: 'insensitive' } });
    const where = { AND: filters };

    const [rows, total] = await Promise.all([
      this.prisma.db.project.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (opts.currentPage - 1) * opts.itemsPerPage,
        take: opts.itemsPerPage,
        include: IN_SCOPE_INCLUDE,
      }),
      this.prisma.db.project.count({ where }),
    ]);
    return { items: rows.map(toProjectInScope), total };
  }

  async findInScope(scope: ProjectReadScope, projectId: number): Promise<ProjectInScope | null> {
    const inScope = scopeWhere(scope);
    const row = await this.prisma.db.project.findFirst({
      where: { AND: [{ id: projectId }, ...(inScope ? [inScope] : [])] },
      include: IN_SCOPE_INCLUDE,
    });
    return row ? toProjectInScope(row) : null;
  }

  async listEventIdsInScope(scope: ProjectReadScope): Promise<number[]> {
    const rows = await this.prisma.db.project.findMany({
      where: scopeWhere(scope),
      distinct: ['eventId'],
      select: { eventId: true },
      orderBy: { eventId: 'asc' },
    });
    return rows.map((row) => row.eventId);
  }
}
