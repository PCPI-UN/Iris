import * as ExcelJS from 'exceljs';

/** Solid background of a cell */
export const solidFill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

/** Thin border of the same color on the four sides */
export const thinBorder = (argb: string): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin', color: { argb } },
  left: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } },
  right: { style: 'thin', color: { argb } },
});
