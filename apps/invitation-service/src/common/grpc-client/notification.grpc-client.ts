import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import {
  EmailTemplate,
  SendEmailRequest,
  SendEmailResponse,
  NOTIFICATION_SERVICE_NAME,
} from '@app/common/generated/notification';

interface NotificationServiceGrpc {
  sendEmail(data: SendEmailRequest): Observable<SendEmailResponse>;
}

@Injectable()
export class NotificationGrpcClient implements OnModuleInit {
  private svc: NotificationServiceGrpc;

  constructor(
    @Inject(NOTIFICATION_SERVICE_NAME) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.svc = this.client.getService<NotificationServiceGrpc>(NOTIFICATION_SERVICE_NAME);
  }

  async sendEmail(
    to: string,
    template: EmailTemplate,
    params: Record<string, any>,
    idempotencyKey?: string,
  ) {
    return firstValueFrom(
      this.svc.sendEmail({ to, template, params, idempotencyKey }),
    );
  }
}
