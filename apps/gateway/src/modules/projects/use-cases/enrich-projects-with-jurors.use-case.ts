import { Injectable, Logger } from '@nestjs/common';
import { ProjectComplete, JurorKey } from '@app/common/generated/project';
import { toProjectTutorsResponse } from '../project-tutors-response';
import {
  ProjectWithEnrichedJurors,
  ProjectJurorMap,
  UserProfileMap,
  JurorProfile,
  ListProjectsWithJurorsResponse,
} from '../types/project-enrichment.types';
import { FetchProjectJurorsUseCase } from './fetch-project-jurors.use-case';
import {
  FetchUserProfilesUseCase,
  FetchUserProfilesConfig,
} from './fetch-user-profiles.use-case';

/**
 * Configuration for enriching projects with juror information
 */
export interface EnrichProjectsConfig {
  userProfileConcurrencyLimit?: number;
}

/**
 * Orchestrator use case for enriching projects with juror and user profile data
 * Coordinates the parallel fetching of jurors and user profiles
 */
@Injectable()
export class EnrichProjectsWithJurorsUseCase {
  private readonly logger = new Logger(EnrichProjectsWithJurorsUseCase.name);

  constructor(
    private readonly fetchProjectJurorsUseCase: FetchProjectJurorsUseCase,
    private readonly fetchUserProfilesUseCase: FetchUserProfilesUseCase,
  ) {}

  /**
   * Enriches a list of projects with juror assignments and user profiles
   * @param projects - Base projects to enrich
   * @param page - Current page number for pagination
   * @param limit - Items per page
   * @param total - Total number of items (for pagination)
   * @param totalPages - Total number of pages
   * @param config - Configuration options
   * @returns Enriched projects with juror information
   */
  async execute(
    projects: ProjectComplete[],
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    config?: EnrichProjectsConfig,
  ): Promise<ListProjectsWithJurorsResponse> {
    if (projects.length === 0) {
      return {
        items: [],
        page,
        limit,
        total,
        totalPages,
      };
    }

    // Step 1: Fetch jurors for all projects in parallel
    const projectJurorMap =
      await this.fetchProjectJurorsUseCase.execute(projects);

    // Step 2: Collect all unique user IDs from juror assignments
    const jurorUserIds = this.extractUniqueUserIds(projectJurorMap);

    // Step 3: Fetch user profiles concurrently with concurrency limiting
    const userProfilesConfig: FetchUserProfilesConfig = {
      concurrencyLimit: config?.userProfileConcurrencyLimit,
    };
    const userProfiles = await this.fetchUserProfilesUseCase.execute(
      jurorUserIds,
      userProfilesConfig,
    );

    // Step 4: Build enriched projects
    const enrichedItems = this.buildEnrichedProjects(
      projects,
      projectJurorMap,
      userProfiles,
    );

    this.logger.debug(
      `Successfully enriched ${enrichedItems.length} projects with juror data`,
    );

    return {
      items: enrichedItems,
      page,
      limit,
      total,
      totalPages,
    };
  }

  /**
   * Extracts all unique user IDs from project juror assignments
   */
  private extractUniqueUserIds(projectJurorMap: ProjectJurorMap): Set<number> {
    const userIds = new Set<number>();

    for (const jurors of projectJurorMap.values()) {
      jurors.forEach((juror) => userIds.add(juror.memberUserId));
    }

    return userIds;
  }

  /**
   * Builds enriched project objects with juror information
   */
  private buildEnrichedProjects(
    projects: ProjectComplete[],
    projectJurorMap: ProjectJurorMap,
    userProfiles: UserProfileMap,
  ): ProjectWithEnrichedJurors[] {
    return projects.map((project) => {
      const jurorAssignments = projectJurorMap.get(project.id) || [];
      const enrichedJurors = jurorAssignments
        .map((juror) => userProfiles.get(juror.memberUserId))
        .filter((profile): profile is JurorProfile => profile !== undefined);

      return {
        id: project.id,
        eventId: project.eventId,
        courseId: project.courseId,
        projectCode: project.projectCode,
        name: project.name,
        description: project.description,
        state: project.state,
        participants: project.participants,
        documents: project.documents,
        pendingParticipants: project.pendingParticipants,
        tutors: toProjectTutorsResponse(project.tutors),
        jurorAssignments,
        jurors: enrichedJurors,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    });
  }
}
