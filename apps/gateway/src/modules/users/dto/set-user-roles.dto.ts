import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class SetUserRolesDto {
  @ApiProperty({
    description:
      'Platform roles the user keeps (the rest are removed). Only the principal admin can grant or remove Admin and FacultyAdmin.',
    example: [9],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  roleIds: number[];
}
