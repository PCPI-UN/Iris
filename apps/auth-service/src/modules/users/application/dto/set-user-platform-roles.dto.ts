import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class SetUserPlatformRolesDto {
  @IsInt()
  userId: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  roleIds: number[];

  // User performing the operation
  @IsInt()
  actorUserId: number;
}
