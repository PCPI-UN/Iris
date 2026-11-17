import { ApiProperty } from '@nestjs/swagger';

/** Response of GET /events/:eventId/my-project/results. */

export class StudentResultRanking {
  @ApiProperty({
    example: 3,
    description: 'Position of the project inside its category',
  })
  position: number;

  @ApiProperty({ example: false, description: 'true when the position is 1' })
  isWinner: boolean;

  @ApiProperty({
    example: false,
    description: 'true when the position is 1 and another project shares it',
  })
  isCoWinner: boolean;

  @ApiProperty({ example: 'Ingeniería de Sistemas' })
  categoryName: string;

  @ApiProperty({
    example: 'Tercer puesto',
    nullable: true,
    type: String,
    description: 'Award titles won in the event, comma separated',
  })
  awardTitle: string | null;
}

export class StudentCriterionScore {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Planteamiento del problema' })
  criterion: string;

  @ApiProperty({ example: 'Fundamentación' })
  component: string;

  @ApiProperty({
    example: 25,
    description: 'Weight of the criterion in the grade, in percent',
  })
  weight: number;

  @ApiProperty({ example: 75, description: 'Average of the jurors scores' })
  score: number;

  @ApiProperty({ example: 90 })
  maxScore: number;
}

export class StudentResultsResponse {
  @ApiProperty({
    example: true,
    description:
      'false until the admin publishes the event results; then no other field is sent',
  })
  resultsPublished: boolean;

  @ApiProperty({
    example: true,
    required: false,
    description: 'false when no juror has evaluated the project',
  })
  evaluated?: boolean;

  @ApiProperty({
    example: 72.5,
    required: false,
    nullable: true,
    type: Number,
    description: 'Average of the jurors grades',
  })
  finalScore?: number | null;

  @ApiProperty({
    example: 90,
    required: false,
    description: 'Highest grade of the event evaluation type',
  })
  maxScore?: number;

  @ApiProperty({
    type: StudentResultRanking,
    required: false,
    nullable: true,
    description:
      'Only the project own position; null when it is not ranked (not evaluated, not approved or the event has no ranking)',
  })
  ranking?: StudentResultRanking | null;

  @ApiProperty({ type: [StudentCriterionScore], required: false })
  criteriaScores?: StudentCriterionScore[];

  @ApiProperty({
    required: false,
    example: 'Buena solución técnica.\n\nAmpliar las pruebas.',
    description:
      'The jurors comments in one text, without saying who wrote each one',
  })
  consolidatedFeedback?: string;
}
