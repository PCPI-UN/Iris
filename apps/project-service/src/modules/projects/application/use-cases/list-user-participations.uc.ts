import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { UserParticipation } from '../../domain/entities/project.entity';
import {
  AcademicProfile,
  deriveAcademicProfile,
} from '../../domain/academic-profile';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

@Injectable()
export class ListUserParticipationsUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
  ) {}

  /**
   * Projects where the user is a confirmed participant, most recent first, and the
   * academic data derived from all of them (not only the returned page).
   */
  async execute(input: {
    userId: number;
    email: string;
    limit?: number;
  }): Promise<{
    participations: UserParticipation[];
    academic: AcademicProfile;
    total: number;
  }> {
    const all = await this.repo.listParticipationsByUser(
      input.userId,
      input.email,
    );
    const limit = Math.min(
      Math.max(input.limit || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    return {
      participations: all.slice(0, limit),
      academic: deriveAcademicProfile(all),
      total: all.length,
    };
  }
}
