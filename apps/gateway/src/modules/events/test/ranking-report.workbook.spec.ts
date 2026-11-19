import * as ExcelJS from 'exceljs';
import type { RankingReportResult } from '../events.service';
import {
  generateRankingExcelBuffer,
  rankingFileName,
} from '../ranking-report.workbook';

const item = (
  over: Partial<RankingReportResult['items'][number]>,
): RankingReportResult['items'][number] => ({
  projectId: 1,
  projectName: 'Proyecto',
  participantNames: ['Ana', 'Luis'],
  categoryId: 1,
  category: 'Ingeniería de Sistemas',
  position: 1,
  evaluationCount: 2,
  individualGrades: [4, 5],
  averageGrade: 4.5,
  ...over,
});

const report = (
  items: RankingReportResult['items'],
  over: Partial<RankingReportResult> = {},
): RankingReportResult => ({
  eventId: 1,
  eventName: 'Feria 2026-2',
  scope: 'admin',
  configuration: { visiblePublic: true, positions: 3, gradeVisible: true },
  items,
  ...over,
});

const border = (argb: string) => ({
  top: { style: 'thin', color: { argb } },
  left: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } },
  right: { style: 'thin', color: { argb } },
});

describe('ranking report workbook', () => {
  const items = [
    item({ projectId: 1, projectCode: 'P-1', position: 1 }),
    item({ projectId: 2, projectCode: 'P-2', position: 2 }),
    item({ projectId: 3, position: 2 }),
  ];

  async function load(): Promise<ExcelJS.Worksheet> {
    const buffer = await generateRankingExcelBuffer(report(items));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Ranking');
    if (!sheet) throw new Error('missing Ranking sheet');
    return sheet;
  }

  it('has the Ranking sheet and the header row', async () => {
    const sheet = await load();
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Posición',
      'Código',
      'Proyecto',
      'Categoría',
      'Participantes',
      'Evaluaciones',
      'Calificaciones',
      'Puntaje Final',
    ]);
  });

  it('styles the header', async () => {
    const cell = (await load()).getRow(1).getCell(1);
    expect(cell.fill).toMatchObject({ fgColor: { argb: 'FF5B9BD5' } });
    expect(cell.font).toMatchObject({
      bold: true,
      color: { argb: 'FFFFFFFF' },
    });
    expect(cell.border).toMatchObject(border('FF9CC2E5'));
  });

  it('stripes the data rows and borders them', async () => {
    const sheet = await load();
    const row2 = sheet.getRow(2).getCell(1);
    const row3 = sheet.getRow(3).getCell(1);
    expect(row2.fill).toMatchObject({ fgColor: { argb: 'FFF7FBFF' } });
    expect(row3.fill).toEqual({ type: 'pattern', pattern: 'none' }); // no stripe
    expect(row2.border).toMatchObject(border('FFD9E2F3'));
    expect(row3.border).toMatchObject(border('FFD9E2F3'));
  });

  it('freezes the header and keeps tied positions', async () => {
    const sheet = await load();
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getRow(3).getCell(1).value).toBe(2);
    expect(sheet.getRow(4).getCell(1).value).toBe(2);
  });
});

describe('rankingFileName', () => {
  it('uses the category and event names', () => {
    expect(rankingFileName(report([item({})]), 'admin')).toBe(
      'ranking_ingenieria_de_sistemas_feria_2026_2_admin.xlsx',
    );
  });

  it('falls back to the category id when there are no items', () => {
    expect(
      rankingFileName(report([], { categoryId: 3, scope: 'public' }), 'public'),
    ).toBe('ranking_categoria_3_feria_2026_2_public.xlsx');
  });
});
