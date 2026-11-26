import { IsInt, IsArray, IsOptional, Min } from 'class-validator';

export class AssignPlatformRolesDto {
  @IsInt()
  @Min(1)
  userId: number;

  @IsArray()
  @IsInt({ each: true })
  roleIds: number[];

  /** Who grants the roles; when set, the administrator rules apply */
  @IsOptional()
  @IsInt()
  @Min(1)
  actorUserId?: number;
}
