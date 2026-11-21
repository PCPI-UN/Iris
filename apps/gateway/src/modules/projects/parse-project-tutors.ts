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
      'El formato de los tutores no es válido. Debe ser un objeto JSON válido.',
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException(
      'El formato de los tutores no es válido. Debe ser un objeto JSON válido.',
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
