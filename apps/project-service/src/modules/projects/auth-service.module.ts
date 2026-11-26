import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AUTH_SERVICE_NAME, protobufPackage } from '@app/common/generated/auth';
import { AuthGrpcClient } from './infrastructure/grpc-client/auth.grpc-client';
import { AuthServiceAdapter } from './infrastructure/grpc-client/auth-service.adapter';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: protobufPackage,
            protoPath: join(process.cwd(), 'libs/common/src/protos/auth.proto'),
            url: configService.get<string>('AUTH_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [AuthGrpcClient, AuthServiceAdapter],
  exports: [AuthServiceAdapter],
})
export class AuthServiceModule {}
