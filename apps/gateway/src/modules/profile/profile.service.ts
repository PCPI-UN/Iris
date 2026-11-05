import { Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { ListUserParticipationsResponse } from '@app/common/generated/project';
import { AuthService } from '../auth/auth.service';
import { AppUser } from '../auth/types/app-user.type';
import { ProjectsService } from '../projects/projects.service';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

const PROFILE_PROJECTS_LIMIT = 10;

export interface ProfileProject {
  id: number;
  name: string;
  eventId: number;
  courseId: number;
  state: string;
  studentCode: string;
}

export interface Profile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  roles: string[];
  // Derived by project-service from the user's participations; not stored on the user
  academic: {
    studentCode: string | null;
    career: string | null;
    semester: string | null;
    derived: true;
  };
  projects: ProfileProject[];
  totalProjects: number;
}

/** Composes the profile from auth (the session user) and project-service. */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getProfile(user: AppUser): Promise<Profile> {
    const { participations = [], academic, total = 0 } = await this.listParticipations(user);

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: (user.platformRoles ?? []).map((role) => role.name),
      academic: {
        studentCode: academic?.studentCode || null,
        career: academic?.career || null,
        semester: academic?.semester || null,
        derived: true,
      },
      projects: participations
        .filter((p) => p.project)
        .map((p) => ({
          id: p.project!.id,
          name: p.project!.name,
          eventId: p.project!.eventId,
          courseId: p.project!.courseId,
          state: String(p.project!.state),
          studentCode: p.studentCode,
        })),
      totalProjects: total,
    };
  }

  async updateProfile(user: AppUser, dto: UpdateOwnProfileDto): Promise<Profile> {
    const updated = await this.authService.updateOwnProfile({
      userId: user.id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    return this.getProfile({
      ...user,
      firstName: updated.firstName,
      lastName: updated.lastName ?? '',
      phone: updated.phone ?? '',
    });
  }

  // Only an unreachable project-service degrades to "no projects"; any other error is real
  private async listParticipations(user: AppUser): Promise<Partial<ListUserParticipationsResponse>> {
    try {
      return await this.projectsService.listUserParticipations(
        user.id,
        user.email,
        PROFILE_PROJECTS_LIMIT,
      );
    } catch (error) {
      if (error?.code !== status.UNAVAILABLE) {
        throw error;
      }
      this.logger.warn(`project-service unavailable; profile of user ${user.id} without projects`);
      return {};
    }
  }
}
