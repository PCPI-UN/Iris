import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { CriterionsModule } from './modules/criterions/criterions.module';
import { TieBreaksModule } from './modules/tiebreaks/tiebreaks.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { UsersModule } from './modules/users/users.module';
import { ProfileModule } from './modules/profile/profile.module';
import { CacheModule } from './common/cache/cache.module';
import { GradingScalesModule } from './modules/grading-scales/grading-scales.module';
import { CacheManagementController } from './common/cache/cache-management.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    CacheModule,
    AuthModule,
    UsersModule,
    ProfileModule,
    EventsModule,
    ProjectsModule,
    EvaluationsModule,
    InvitationsModule,
    CriterionsModule,
    TieBreaksModule,
    GradingScalesModule,
    DashboardModule,
  ],
  controllers: [CacheManagementController, HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
