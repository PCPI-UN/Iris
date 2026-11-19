import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsArray, Min, IsString, ValidateIf } from 'class-validator';
import { InvitationTargetType } from '../../domain/entities/invitation.entity';

export class CreateInvitationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  // Picks the email template of PROJECT invitations; the tutor invitation email does not use it
  @ValidateIf(
    (dto: CreateInvitationDto) =>
      dto.targetType !== InvitationTargetType.PROJECT_TUTOR,
  )
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsEnum(InvitationTargetType)
  @IsNotEmpty()
  targetType: InvitationTargetType;

  @IsInt()
  @Min(1)
  targetId: number;

  @IsInt()
  @Min(1)
  invitedByUserId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  roleIds: number[] = [];

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;
}