import * as ExcelJS from 'exceljs';
import { roundGrade } from '@app/common/utils/grade-rounding';
import { solidFill, thinBorder } from '../../common/excel/excel-styles';
import { fileNamePart } from '../../common/excel/xlsx-file';
import type { RankingReportResult } from './events.service';

const COLORS = {
  header: 'FF5B9BD5',
  headerFont: 'FFFFFFFF',
  headerBorder: 'FF9CC2E5',
  rowBorder: 'FFD9E2F3',
  stripe: 'FFF7FBFF',
} as const;
const HEADER_BORDER = thinBorder(COLORS.headerBorder);
const ROW_BORDER = thinBorder(COLORS.rowBorder);

/**
 * Builds an XLSX buffer from ranking JSON data.
 * The controller is responsible for setting download headers.
 */
export async function generateRankingExcelBuffer(
  report: RankingReportResult,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Ranking');

  worksheet.columns = [
    { header: 'Posición', key: 'position', width: 10 },
    { header: 'Código', key: 'projectCode', width: 10 },
    { header: 'Proyecto', key: 'projectName', width: 32 },
    { header: 'Categoría', key: 'category', width: 24 },
    { header: 'Participantes', key: 'participantNames', width: 48 },
    { header: 'Evaluaciones', key: 'evaluationCount', width: 14 },
    { header: 'Calificaciones', key: 'individualGrades', width: 28 },
    { header: 'Puntaje Final', key: 'averageGrade', width: 14 },
  ];

  for (const item of report.items) {
    worksheet.addRow({
      position: item.position,
      projectCode: item.projectCode || '',
      projectName: item.projectName,
      category: item.category,
      participantNames: item.participantNames.join(', '),
      evaluationCount: item.evaluationCount,
      individualGrades: item.individualGrades?.length
        ? item.individualGrades.join(', ')
        : '',
      averageGrade:
        item.averageGrade !== undefined ? roundGrade(item.averageGrade) : '',
    });
  }

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = 'A1:H1';

  const headerRow = worksheet.getRow(1);
  headerRow.height = 20;
  headerRow.eachCell((cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = solidFill(COLORS.header);
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = HEADER_BORDER;
  });

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    row.eachCell((cell: ExcelJS.Cell, columnNumber: number) => {
      cell.alignment = {
        horizontal: columnNumber <= 2 ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = ROW_BORDER;
      if (rowIndex % 2 === 0) {
        cell.fill = solidFill(COLORS.stripe);
      }
    });
  }

  worksheet.getColumn(1).width = 10;
  worksheet.getColumn(1).alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  worksheet.getColumn(2).width = 10;
  worksheet.getColumn(2).alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  worksheet.getColumn(3).width = 32;
  worksheet.getColumn(4).width = 24;
  worksheet.getColumn(5).width = 48;
  worksheet.getColumn(6).width = 14;
  worksheet.getColumn(7).width = 28;
  worksheet.getColumn(8).width = 14;

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(rawBuffer);
}

export function rankingFileName(
  report: RankingReportResult,
  scope: 'admin' | 'public',
): string {
  const categoryName =
    report.items[0]?.category ||
    (report.categoryId ? `categoria_${report.categoryId}` : 'general');

  return `ranking_${fileNamePart(categoryName)}_${fileNamePart(report.eventName)}_${scope}.xlsx`;
}
