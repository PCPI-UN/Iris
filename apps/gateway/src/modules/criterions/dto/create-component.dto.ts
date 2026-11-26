import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateComponentDto {
  @ApiProperty({
    description: 'Name of the component',
    example: 'Design Quality',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description:
      'Weight of the component as a fraction of the grade (0 to 1). The components of an event must add up to 1 ' +
      'before the event can be evaluated; it is shared by every category of the event.',
    example: 0.4,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  weight: number;

  @ApiProperty({
    description: 'Event the component belongs to',
    example: 1,
  })
  @IsInt()
  @Type(() => Number)
  eventId: number;
}
