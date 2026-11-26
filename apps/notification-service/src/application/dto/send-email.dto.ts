import {
  SendEmailRequest,
  EmailTemplate,
} from '@app/common/generated/notification';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendEmailDto implements SendEmailRequest {
  @IsEmail()
  @IsNotEmpty()
  to: string;

  @IsEnum(EmailTemplate)
  @IsNotEmpty()
  template: EmailTemplate;

  @IsObject()
  params: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
