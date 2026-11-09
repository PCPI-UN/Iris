import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { AssignJurorBulkDTO } from '../dto/assign-juror-bulk.dto';
import { JUROR_ROLE_ID } from '../../domain/entities/project.entity';
// import { EventServicePort, EVENT_SERVICE_PORT } from '../ports/event-service.port';
// import { NotFoundError, ValidationError } from '../../domain/errors';

@Injectable()
export class AssignJurorBulkUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    // @Inject(EVENT_SERVICE_PORT) private readonly eventService: EventServicePort,
  ) {}

  async execute(input: AssignJurorBulkDTO) {
    const { userId, projectIds } = input;

    if (!projectIds?.length) {
      return {
        assigned: 0,
        failures: [] as { projectId: number; reason: string }[],
      };
    }

    // 1. Fetch all projects
    const projects = await this.repo.findManyByIds(projectIds);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const failures: { projectId: number; reason: string }[] = [];

    // 2. Validate all projects exist
    const notFound = projectIds.filter((pid) => !byId.has(pid));
    if (notFound.length > 0) {
      notFound.forEach((pid) => {
        failures.push({ projectId: pid, reason: 'Project not found' });
      });
    }

    if (projects.length === 0) {
      return { assigned: 0, failures };
    }

    // 3. Validar que todos pertenezcan al mismo evento
    const eventId = projects[0].eventId;
    const mismatchedProjects = projects.filter((p) => p.eventId !== eventId);
    if (mismatchedProjects.length > 0) {
      mismatchedProjects.forEach((p) => {
        failures.push({
          projectId: p.id,
          reason: `Project belongs to event ${p.eventId}, expected ${eventId}`,
        });
      });
    }

    // Nos quedamos solo con los proyectos válidos
    const validProjectIds = projects
      .filter((p) => p.eventId === eventId)
      .map((p) => p.id)
      .filter((pid) => !failures.some((f) => f.projectId === pid));

    if (validProjectIds.length === 0) {
      return { assigned: 0, failures };
    }

    const jurorMembership = {
      memberUserId: userId,
      memberEventId: eventId,
      memberRoleId: JUROR_ROLE_ID,
    };

    // 5. Intentamos bulk, si falla hacemos upsert uno a uno
    try {
      await this.repo.bulkUpsertAssignments(validProjectIds, jurorMembership);
      return { assigned: validProjectIds.length, failures };
    } catch (error) {
      let assigned = 0;
      for (const pid of validProjectIds) {
        try {
          await this.repo.upsertAssignment(pid, jurorMembership);
          assigned += 1;
        } catch (err: any) {
          failures.push({
            projectId: pid,
            reason: `Failed to assign: ${err.message}`,
          });
        }
      }
      return { assigned, failures };
    }
  }
}
