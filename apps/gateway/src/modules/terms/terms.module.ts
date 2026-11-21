import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { TermsController } from './terms.controller';

@Module({
  imports: [EventsModule],
  controllers: [TermsController],
})
export class TermsModule {}
