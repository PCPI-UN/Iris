import * as ExcelJS from 'exceljs';
import { roundGrade } from '@app/common/utils/grade-rounding';
import type { RankingReportResult } from './events.service';

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
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' },
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9CC2E5' } },
      left: { style: 'thin', color: { argb: 'FF9CC2E5' } },
      bottom: { style: 'thin', color: { argb: 'FF9CC2E5' } },
      right: { style: 'thin', color: { argb: 'FF9CC2E5' } },
    };
  });

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    row.eachCell((cell: ExcelJS.Cell, columnNumber: number) => {
      cell.alignment = {
        horizontal: columnNumber <= 2 ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      };
      if (rowIndex % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF7FBFF' },
        };
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

function normalizeFilePart(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'general';
}

export function rankingFileName(
  report: RankingReportResult,
  scope: 'admin' | 'public',
): string {
  const categoryName =
    report.items[0]?.category ||
    (report.categoryId ? `categoria_${report.categoryId}` : 'general');

  return `ranking_${normalizeFilePart(categoryName)}_${normalizeFilePart(report.eventName)}_${scope}.xlsx`;
}
