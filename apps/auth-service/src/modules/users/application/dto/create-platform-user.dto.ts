import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  ArrayMinSize,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePlatformUserDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase())
  email: string;

  @IsPhoneNumber('CO')
  @IsOptional()
  phone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  roleIds: number[];

  // User performing the operation
  @IsInt()
  actorUserId: number;
}