import { IsInt, IsOptional, IsPositive, Max } from 'class-validator';

export class ListEventMembersDTO {
  @IsInt()
  @IsPositive()
  eventId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  roleId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(50, { message: 'limit no puede ser mayor que 50' })
  limit?: number = 10;

  @IsOptional()
  @IsInt()
  @IsPositive()
  page?: number = 1;
}