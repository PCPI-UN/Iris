import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
  UserParticipation,
} from '@app/common/generated/project';
import { AuthService } from '../auth/auth.service';
import { AppUser } from '../auth/types/app-user.type';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Values used to backfill legacy rows when career/semester were added; they carry no information
const PLACEHOLDER_VALUES = new Set(['', 'N/A']);

const meaningful = (value?: string | null): string | null =>
  value && !PLACEHOLDER_VALUES.has(value.trim()) ? value.trim() : null;

export interface ProfileProject {
  id: number;
  name: string;
  eventId: number;
  courseId: number;
  state: string;
  studentCode: string;
}

export interface AcademicInfo {
  studentCode: string | null;
  career: string | null;
  semester: string | null;
  // Derived from the user's project participations; not stored on the user
  derived: true;
}

export interface Profile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  roles: string[];
  academic: AcademicInfo;
  projects: ProfileProject[];
}

@Injectable()
export class ProfileService implements OnModuleInit {
  private readonly logger = new Logger(ProfileService.name);
  private projectsService: ProjectsServiceClient;

  constructor(
    private readonly authService: AuthService,
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectsClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.projectsService =
      this.projectsClient.getService<ProjectsServiceClient>(PROJECTS_SERVICE_NAME);
  }

  async getProfile(user: AppUser): Promise<Profile> {
    const participations = await this.listParticipations(user.id);

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: (user.platformRoles ?? []).map((role) => role.name),
      academic: this.deriveAcademicInfo(participations),
      projects: participations.map((p) => ({
        id: p.project!.id,
        name: p.project!.name,
        eventId: p.project!.eventId,
        courseId: p.project!.courseId,
        state: String(p.project!.state),
        studentCode: p.studentCode,
      })),
    };
  }

  async updateProfile(user: AppUser, dto: UpdateProfileDto): Promise<Profile> {
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

  /**
   * Participations come ordered from the most recent project. Each academic
   * field takes the most recent meaningful value, so a newer submission with
   * an updated career or semester wins over older ones.
   */
  private deriveAcademicInfo(participations: UserParticipation[]): AcademicInfo {
    const firstOf = (pick: (p: UserParticipation) => string | null | undefined) =>
      participations.map((p) => meaningful(pick(p))).find((v) => v !== null) ?? null;

    return {
      studentCode: firstOf((p) => p.studentCode),
      career: firstOf((p) => p.career),
      semester: firstOf((p) => p.semester),
      derived: true,
    };
  }

  // The profile must still load (and save) when project-service is unavailable
  private async listParticipations(userId: number): Promise<UserParticipation[]> {
    try {
      const response = await firstValueFrom(
        this.projectsService.listUserParticipations({ userId }),
      );
      return (response.participations ?? []).filter((p) => p.project);
    } catch (error) {
      this.logger.warn(
        `Could not load project participations for user ${userId}: ${error?.message}`,
      );
      return [];
    }
  }
}
