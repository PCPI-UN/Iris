import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PendingTutorInputDto {
  @ApiProperty({ example: 'Laura' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Gómez', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'laura.gomez@university.edu' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/**
 * Tutors of a project: users already registered (picked from the tutor search) and
 * tutors typed in by name and email, who are invited by email once the project is approved.
 */
export class ProjectTutorsInputDto {
  @ApiProperty({
    description: 'Ids of existing users with the Tutor or Professor role',
    type: [Number],
    required: false,
    example: [12],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  userIds: number[] = [];

  @ApiProperty({
    description:
      'Tutors who are not registered yet; each one is invited by email once the project is approved',
    type: [PendingTutorInputDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PendingTutorInputDto)
  pending: PendingTutorInputDto[] = [];
}
