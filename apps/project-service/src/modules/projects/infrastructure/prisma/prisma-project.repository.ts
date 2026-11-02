import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { PendingProjectParticipant, Project, TypedDocument } from '../../domain/entities/project.entity';
import { ProjectDocument, ProjectState, JurorKey, ProjectParticipant, UserParticipation } from '../../domain/entities/project.entity';


type CreateProjectInput = {
  eventId: number;
  courseId: number;
  name: string;
  projectCode?: string;
  description?: string;
  eventNumber?: string;
  state: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
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

type ListOpts = { courseId?: number; q?: string; currentPage?: number; itemsPerPage?: number; state?: ProjectState };

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaService) { }

  async create(data: CreateProjectInput): Promise<Project> {
    return this.prisma.project.create({
      data: {
        eventId: data.eventId,
        courseId: data.courseId,
        name: data.name,
        projectCode: data.projectCode ?? null,
        description: data.description ?? null,
        eventNumber: data.eventNumber ?? null,
        state: data.state,
      },
    }) as unknown as Project;
  }

  async findById(id: number): Promise<Project | null> {
    return (await this.prisma.project.findUnique({ where: { id } })) as unknown as Project | null;
  }

  async findManyByIds(ids: number[]): Promise<Project[]> {
    if (!ids.length) return [];
    return (await this.prisma.project.findMany({ where: { id: { in: ids } } })) as unknown as Project[];
  }

  async findProject(eventId: number, courseId: number, name: string): Promise<Project | null> {
    return (await this.prisma.project.findFirst({
      where: { eventId, courseId, name },
    })) as unknown as Project | null;
  }

  async findProjectWithEvent(projectId: number): Promise<Project | null> {
    return this.prisma.project.findUnique({
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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
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
      this.prisma.project.count({ where }),
    ]);

    return { items: items as unknown as Project[], total, currentPage, itemsPerPage };
  }

  async countAll(): Promise<number> {
    return this.prisma.project.count();
  }

  async updateProject(input: {
    id: number;
    name?: string;
    projectCode?: string | null;
    description?: string | null;
    eventNumber?: string | null;
    courseId?: number;
    state?: ProjectState;
  }): Promise<Project> {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.projectCode !== undefined) data.projectCode = input.projectCode;
    if (input.description !== undefined) data.description = input.description;
    if (input.eventNumber !== undefined) data.eventNumber = input.eventNumber;
    if (input.courseId !== undefined) data.courseId = input.courseId;
    if (input.state !== undefined) data.state = input.state;

    return (await this.prisma.project.update({
      where: { id: input.id },
      data,
    })) as unknown as Project;
  }

  async setProjectState(id: number, state: ProjectState): Promise<Project> {
    return (await this.prisma.project.update({
      where: { id },
      data: { state },
    })) as unknown as Project;
  }

  async setProjectStateWithReason(id: number, state: ProjectState, reason?: string): Promise<Project> {
    return (await this.prisma.project.update({
      where: { id },
      data: {
        state,
        reason: reason,
      },
    })) as unknown as Project;
  }

  async delete(id: number): Promise<void> {
    await this.prisma.project.delete({ where: { id } });
  }

  async addDocument(projectId: number, url: string, type: TypedDocument): Promise<ProjectDocument> {

    return (await this.prisma.projectDocument.create({
      data: { projectId, url, type },
    })) as unknown as ProjectDocument;
  }

  async listDocuments(projectId: number): Promise<ProjectDocument[]> {
    return (await this.prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })) as unknown as ProjectDocument[];
  }

  async upsertAssignment(projectId: number, juror: JurorKey): Promise<void> {
    await this.prisma.projectAssignment.upsert({
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

    await this.prisma.projectAssignment.createMany({
      data,
      skipDuplicates: true, // Skip if assignment already exists for efficient insertion!
    });
  }

  async removeAssignment(projectId: number, juror: JurorKey): Promise<boolean> {
    const res = await this.prisma.projectAssignment.deleteMany({
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
    const rows = await this.prisma.projectAssignment.findMany({
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
    return this.prisma.projectParticipant.count({
      where: { projectId, userId },
    }).then(count => count > 0);
  }

  async addParticipant(input: { projectId: number; userId: number; studentCode: string }): Promise<ProjectParticipant> {
    // Idempotente: si ya existe (PK compuesta), actualiza solo studentCode cuando venga
    return (await this.prisma.projectParticipant.upsert({
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
    return (await this.prisma.projectParticipant.findMany({
      where: { projectId },
      orderBy: { userId: 'asc' },
      select: { userId: true, projectId: true, studentCode: true },
    })) as unknown as ProjectParticipant[];
  }

  async addPendingParticipant(input: AddPendingParticipantInput): Promise<PendingProjectParticipant> {
    const existing = await this.prisma.pendingProjectParticipant.findFirst({
      where: {
        projectId: input.projectId,
        email: input.email,
      },
    });
    // console.log('Existing pending participant:', existing);
    // console.log('Input data:', input);
    if (existing) {
      // Actualizar
      return this.prisma.pendingProjectParticipant.update({
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
      return this.prisma.pendingProjectParticipant.create({
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
    return (await this.prisma.pendingProjectParticipant.findMany({
      where: { projectId },
      orderBy: { firstName: 'asc' },
    })) as unknown as PendingProjectParticipant[];
  }

  async markPendingsInvited(projectId: number, emails: string[], invitedAt: Date) {
    if (!emails.length) return 0;
    const res = await this.prisma.pendingProjectParticipant.updateMany({
      where: {
        projectId,
        email: { in: emails.map(e => e.trim().toLowerCase()) },
      },
      data: {
        status: 'INVITED',
        invitedAt,
      },
    });
    return res.count; // cuántos registros actualizó
  }

  async listAssignedToJuror(juror: JurorKey, opts?: { page?: number; pageSize?: number }
  ): Promise<{ items: Project[]; total: number }> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 10;

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
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
      this.prisma.project.count({
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
    const res = await this.prisma.pendingProjectParticipant.updateMany({
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
    return (await this.prisma.projectDocument.findUnique({
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
    return (await this.prisma.projectDocument.update({
      where: { id: input.id },
      data,
    })) as unknown as ProjectDocument;
  }

  async findByEventIdAndUserId(eventId: number, userId: number): Promise<Project | null> {
    const project = await this.prisma.project.findFirst({
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

  async listParticipationsByUser(userId: number): Promise<UserParticipation[]> {
    const participations = await this.prisma.projectParticipant.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { project: { createdAt: 'desc' } },
    });
    if (!participations.length) return [];

    // career and semester only exist on the pending participant row captured at
    // submission; it is linked to the confirmed participant by project and student code
    const pendings = await this.prisma.pendingProjectParticipant.findMany({
      where: {
        OR: participations.map(p => ({ projectId: p.projectId, studentCode: p.studentCode })),
      },
      select: { projectId: true, studentCode: true, career: true, semester: true },
    });
    const byKey = new Map(pendings.map(p => [`${p.projectId}:${p.studentCode}`, p]));

    return participations.map(p => {
      const pending = byKey.get(`${p.projectId}:${p.studentCode}`);
      return {
        project: p.project as unknown as Project,
        studentCode: p.studentCode,
        career: pending?.career ?? null,
        semester: pending?.semester ?? null,
      };
    });
  }

}
