import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProjectTutorsInputDto } from './dto/project-tutors-input.dto';

/**
 * Reads the `tutors` field of the multipart submission: a JSON string with the shape of
 * `ProjectTutorsInputDto`. A missing field means no tutors.
 */
export function parseProjectTutors(raw?: string): ProjectTutorsInputDto {
  if (!raw) return plainToInstance(ProjectTutorsInputDto, {});

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException(
      'Invalid tutors format. Must be a valid JSON object.',
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException(
      'Invalid tutors format. Must be a valid JSON object.',
    );
  }

  const tutors = plainToInstance(ProjectTutorsInputDto, parsed);
  const errors = validateSync(tutors, {
    whitelist: true,
    forbidUnknownValues: true,
  });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) => flattenMessages(error));
    throw new BadRequestException(messages);
  }
  return tutors;
}

function flattenMessages(error: {
  constraints?: Record<string, string>;
  children?: unknown[];
}): string[] {
  const own = Object.values(error.constraints ?? {});
  const nested = (error.children ?? []).flatMap((child) =>
    flattenMessages(child as typeof error),
  );
  return [...own, ...nested];
}
