import { IsInt } from 'class-validator';

export class DeactivateUserDto {
  @IsInt()
  id: number;

  // User performing the operation
  @IsInt()
  actorUserId: number;
}
