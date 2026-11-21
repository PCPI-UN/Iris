import { IsArray, IsEmail, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { InvitationTargetType } from '../../domain/entities/invitation.entity';

export class AuthorizeInvitationDto {
  @IsInt()
  @Min(1)
  inviterUserId: number;

  @IsEmail()
  email: string;

  @IsEnum(InvitationTargetType)
  targetType: InvitationTargetType;

  @IsInt()
  @Min(1)
  targetId: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  roleIds: number[] = [];
}
