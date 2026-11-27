import * as ExcelJS from 'exceljs';
import { normalizeText } from '@app/common/utils/text.util';

/** "Número*" -> "numero" */
export const normalizeHeader = (value: string): string =>
  normalizeText(value.replace(/\*/g, ''));

/** Plain text of a cell, whatever Excel stored: number, hyperlink, rich text or formula */
export const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) {
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  }
  if ('hyperlink' in value) {
    const text = cellText(value.text);
    return text || value.hyperlink.replace(/^mailto:/i, '').trim();
  }
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText(value.result);
  }
  // { error: '#N/A' } and anything else
  return '';
};
