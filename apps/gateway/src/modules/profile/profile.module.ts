import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
