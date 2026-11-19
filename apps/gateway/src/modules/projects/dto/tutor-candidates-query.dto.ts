import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class TutorCandidatesQueryDto {
  @ApiProperty({
    description:
      'Words of the first or last name ("laura gó"); at least 3 letters',
    example: 'lau',
    minLength: 3,
  })
  // Trimmed before the length check, so "  a" does not pass as a 3-letter search
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  search: string;
}
