import { Injectable } from '@nestjs/common';
import { Prisma, ProjectChangeLog } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { ProjectChangeLogRepository } from '../../domain/repositories/project-change-log.repository';
import {
  NewProjectChangeLogEntry,
  ProjectChangeLogEntry,
  ProjectChangeValues,
} from '../../domain/entities/project-change-log.entity';

const asValues = (value: Prisma.JsonValue): ProjectChangeValues =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const toEntry = (row: ProjectChangeLog): ProjectChangeLogEntry => ({
  id: row.id,
  projectId: row.projectId,
  actorUserId: row.actorUserId,
  action: row.action,
  before: asValues(row.before),
  after: asValues(row.after),
  reason: row.reason ?? null,
  createdAt: row.createdAt,
});

/**
 * Data of a project_change_log row, for the repository methods that make an administrative
 * edit: they add `prisma.projectChangeLog.create({ data })` to the same $transaction as the
 * edit (as replaceTutors groups its writes), so the edit and its entry are saved together.
 */
export const toProjectChangeLogData = (
  entry: NewProjectChangeLogEntry,
): Prisma.ProjectChangeLogUncheckedCreateInput => ({
  projectId: entry.projectId,
  actorUserId: entry.actorUserId,
  action: entry.action,
  before: entry.before as Prisma.InputJsonObject,
  after: entry.after as Prisma.InputJsonObject,
  reason: entry.reason,
});

@Injectable()
export class PrismaProjectChangeLogRepository implements ProjectChangeLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByProject(projectId: number): Promise<ProjectChangeLogEntry[]> {
    const rows = await this.prisma.projectChangeLog.findMany({
      where: { projectId },
      // id breaks ties between entries written in the same instant
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toEntry);
  }
}
