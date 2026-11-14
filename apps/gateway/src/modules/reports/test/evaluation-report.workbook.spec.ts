import * as ExcelJS from 'exceljs';
import {
  DETAIL_SHEET,
  NO_COMMENTS,
  NO_EVALUATIONS,
  NOT_EVALUATED,
  SUMMARY_SHEET,
  buildEvaluationReportBuffer,
  evaluationReportFileName,
  scoreBand,
} from '../evaluation-report.workbook';
import { EvaluationReport } from '../evaluation-report.types';

/**
 * CU-86e3vmz0b: the Excel follows the approved format (Reporte_Evaluacion_Feria_Proyectos.xlsx).
 * The generated file is read back, so the test checks what the user opens.
 */
describe('Evaluation report workbook', () => {
  const report: EvaluationReport = {
    eventId: 10,
    eventName: 'Feria de Proyectos Finales',
    categoryId: 7,
    categoryName: 'Departamento de Ingeniería Civil y Ambiental',
    maxScore: 100,
    generatedAt: new Date('2026-11-13T15:00:00Z'),
    projects: [
      {
        rowNumber: 1,
        projectId: 120,
        projectName: 'Vía de integración',
        participantNames: ['Ana Pérez', 'Luis Gómez'],
        evaluated: true,
        finalScore: 85.8,
        position: 1,
        jurorCount: 2,
        comments: ['Muy claros', 'Faltó el costo'],
        components: [
          {
            component: 'Exposición',
            weight: 0.5,
            criteria: [
              { criterionId: 1, criterion: 'Claridad', weight: 0.2, score: 80 },
              { criterionId: 2, criterion: 'Dominio', weight: 0.3, score: 90 },
            ],
          },
          {
            component: 'Solución',
            weight: 0.5,
            criteria: [
              { criterionId: 3, criterion: 'Diseño', weight: 0.5, score: 86 },
            ],
          },
        ],
      },
      {
        rowNumber: 2,
        projectId: 113,
        projectName: 'Conexión logística',
        participantNames: ['Carlos Ruiz'],
        evaluated: true,
        finalScore: 85.8,
        position: 1,
        jurorCount: 3,
        comments: [],
        components: [
          {
            component: 'Exposición',
            weight: 1,
            criteria: [
              { criterionId: 1, criterion: 'Claridad', weight: 1, score: 85.8 },
            ],
          },
        ],
      },
      {
        rowNumber: 3,
        projectId: 99,
        projectName: 'Sin evaluar',
        participantNames: [],
        evaluated: false,
        finalScore: null,
        position: null,
        jurorCount: 0,
        comments: [],
        components: [],
      },
    ],
  };

  const load = async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await buildEvaluationReportBuffer(report)) as any,
    );
    return workbook;
  };

  const values = (sheet: ExcelJS.Worksheet, row: number, columns: number) =>
    Array.from(
      { length: columns },
      (_, i) => sheet.getRow(row).getCell(i + 1).value,
    );

  it('has the two sheets of the approved format', async () => {
    const workbook = await load();
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      SUMMARY_SHEET,
      DETAIL_SHEET,
    ]);
  });

  it('writes the summary rows with co-winners sharing the position', async () => {
    const sheet = (await load()).getWorksheet(SUMMARY_SHEET)!;

    expect(sheet.getCell('A1').value).toBe(
      'REPORTE DE EVALUACIÓN — FERIA DE PROYECTOS FINALES',
    );
    expect(sheet.getCell('A2').value).toBe(
      'Departamento de Ingeniería Civil y Ambiental — Resumen consolidado por proyecto',
    );
    expect(values(sheet, 4, 8)).toEqual([
      'Código',
      'ID Proyecto',
      'Nombre del Proyecto',
      'Integrantes del Equipo',
      'Puntaje Final',
      'Posición',
      'N° de Jurados',
      'Comentarios Consolidados',
    ]);
    expect(values(sheet, 5, 8)).toEqual([
      1,
      120,
      'Vía de integración',
      'Ana Pérez, Luis Gómez',
      85.8,
      1,
      2,
      'Muy claros | Faltó el costo',
    ]);
    expect(values(sheet, 6, 8)).toEqual([
      2,
      113,
      'Conexión logística',
      'Carlos Ruiz',
      85.8,
      1,
      3,
      NO_COMMENTS,
    ]);
    expect(values(sheet, 7, 8)).toEqual([
      3,
      99,
      'Sin evaluar',
      '',
      NOT_EVALUATED,
      '—',
      0,
      NO_COMMENTS,
    ]);
    expect(sheet.getCell('A9').text).toContain('coganadores');
  });

  it('freezes the header and colors the final grade by band', async () => {
    const sheet = (await load()).getWorksheet(SUMMARY_SHEET)!;

    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    expect(
      (sheet.getCell('E5').fill as ExcelJS.FillPattern).fgColor?.argb,
    ).toBe('FFC6EFCE');
    // An unevaluated project has no band color
    expect((sheet.getCell('E7').fill as ExcelJS.FillPattern).pattern).not.toBe(
      'solid',
    );
    expect(sheet.getCell('A4').font?.bold).toBe(true);
  });

  it('writes one detail row per criterion with merged project and component cells', async () => {
    const sheet = (await load()).getWorksheet(DETAIL_SHEET)!;

    expect(values(sheet, 4, 11)).toEqual([
      'Código',
      'Nombre del Proyecto',
      'Integrantes del Equipo',
      'Componente',
      'Peso del Componente',
      'Criterio',
      'Peso del Criterio',
      'Nota del Criterio',
      'Puntaje Final del Proyecto',
      'N° de Jurados',
      'Comentarios Consolidados',
    ]);
    expect(values(sheet, 5, 11)).toEqual([
      1,
      'Vía de integración',
      'Ana Pérez, Luis Gómez',
      'Exposición',
      0.5,
      'Claridad',
      0.2,
      80,
      85.8,
      2,
      'Muy claros | Faltó el costo',
    ]);
    expect(values(sheet, 6, 8).slice(5)).toEqual(['Dominio', 0.3, 90]);
    expect(values(sheet, 7, 8).slice(3)).toEqual([
      'Solución',
      0.5,
      'Diseño',
      0.5,
      86,
    ]);

    const merges = (sheet.model as { merges: string[] }).merges;
    expect(merges).toEqual(
      expect.arrayContaining([
        'A5:A7',
        'B5:B7',
        'I5:I7',
        'K5:K7',
        'D5:D6',
        'E5:E6',
      ]),
    );
    // A project with one criterion is not merged
    expect(merges.some((m) => m.startsWith('A8'))).toBe(false);
  });

  it('keeps an unevaluated project in the detail with one row', async () => {
    const sheet = (await load()).getWorksheet(DETAIL_SHEET)!;

    expect(values(sheet, 9, 11)).toEqual([
      3,
      'Sin evaluar',
      '',
      null,
      null,
      NO_EVALUATIONS,
      null,
      null,
      NOT_EVALUATED,
      0,
      NO_COMMENTS,
    ]);
    expect(sheet.views[0]).toMatchObject({
      state: 'frozen',
      xSplit: 3,
      ySplit: 4,
    });
  });

  it('builds a safe file name', () => {
    expect(evaluationReportFileName(report)).toBe(
      'reporte_evaluacion_departamento_de_ingenieria_civil_y_ambiental_feria_de_proyectos_finales.xlsx',
    );
  });

  describe('scoreBand', () => {
    it.each([
      [85.8, 100, 'high'],
      [84, 100, 'high'],
      [83.99, 100, 'mid'],
      [75, 100, 'mid'],
      [74.99, 100, 'low'],
      [3.4, 4, 'high'],
      [10, 0, 'low'],
    ])('%p of %p is %p', (score, max, band) => {
      expect(scoreBand(score, max)).toBe(band);
    });
  });
});
