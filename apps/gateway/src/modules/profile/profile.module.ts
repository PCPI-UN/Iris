import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import {
  PROJECTS_SERVICE_NAME,
  protobufPackage as projectProtobufPackage,
} from '@app/common/generated/project';
import { AuthModule } from '../auth/auth.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { EditableProfileFieldsGuard } from './guards/editable-fields.guard';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: PROJECTS_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: projectProtobufPackage,
            loader: {
              keepCase: true,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
              arrays: true,
            },
            protoPath: join(process.cwd(), 'libs/common/src/protos/project.proto'),
            url: configService.get<string>('PROJECT_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ProfileController],
  providers: [ProfileService, EditableProfileFieldsGuard],
})
export class ProfileModule {}
