import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ListEventMembersDTO {
  @ApiProperty({
    description: 'ID of the event to filter members',
    example: 1,
  })
  @IsInt() @IsPositive() @IsNotEmpty()
  @Type(() => Number)
  eventId: number;

  @ApiProperty({
    description: 'ID of the role to filter members',
    example: 2,
    required: false,
  })
  @IsInt() @IsPositive() @IsOptional()
  @Type(() => Number)
  roleId?: number;

  @ApiProperty({
    description: 'Maximum number of members to return (max 20)',
    example: 20,
    required: false,
  })
  @IsInt() @IsPositive() @IsOptional()
  @Max(20, { message: 'limit no puede ser mayor que 20' })
  @Type(() => Number)
  limit?: number = 20;

  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
  })
  @IsInt() @IsPositive() @IsOptional()
  @Type(() => Number)
  page?: number = 1;
}