import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { GRADING_SCALE_SERVICE_NAME, protobufPackage } from '@app/common/generated/evaluation';
import { GradingScalesController } from './grading-scales.controller';
import { GradingScalesService } from './grading-scales.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: GRADING_SCALE_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: protobufPackage,
            protoPath: join(process.cwd(), 'libs/common/src/protos/evaluation.proto'),
            url: configService.get<string>('EVALUATION_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [GradingScalesController],
  providers: [GradingScalesService],
})
export class GradingScalesModule {}
