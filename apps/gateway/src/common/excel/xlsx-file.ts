import { StreamableFile } from '@nestjs/common';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** "Ingeniería Civil" -> "ingenieria_civil"; empty -> "general". Safe as part of a file name */
export function fileNamePart(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents left by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'general';
}

/** Download response of an .xlsx buffer, with its type, name and length */
export function xlsxFile(buffer: Buffer, fileName: string): StreamableFile {
  return new StreamableFile(buffer, {
    type: XLSX_CONTENT_TYPE,
    disposition: `attachment; filename="${fileName}"`,
    length: buffer.length,
  });
}
