import { IsInt } from 'class-validator';
import { OwnProfileFieldsDto } from '@app/common/dtos/own-profile.dto';

/**
 * Self-service profile edition request. Only the fields of OwnProfileFieldsDto
 * can change; restricted fields (email, password, status, active, roles) are not
 * declared, so the global ValidationPipe (forbidNonWhitelisted) rejects them.
 */
export class UpdateOwnProfileDto extends OwnProfileFieldsDto {
  @IsInt()
  userId: number;
}
