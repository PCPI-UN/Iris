import * as ExcelJS from 'exceljs';
import {
  buildGradesBuffer,
  GRADES_SHEET,
  gradesFileName,
  HEADER_ROW,
  HIDDEN_GRADE,
  NO_GRADE,
  visibilityNote,
} from '../academic-grades.workbook';
import { GradesReport } from '../academic.types';

const report = (overrides: Partial<GradesReport> = {}): GradesReport => ({
  eventId: 4,
  eventName: 'Feria de Proyectos 2026',
  resultsPublished: false,
  gradeVisibility: 'PUBLISHED_ONLY',
  generatedAt: new Date('2026-11-15T10:00:00Z'),
  projects: [
    {
      projectId: 1, projectCode: 'C1', projectName: 'EcoVision', participantNames: ['Ana Paz', 'Luis Ruiz'],
      academicCourse: { id: 2, nrc: '1001', termId: 3, term: '202610', name: 'PF Sistemas', departmentName: 'Sistemas' },
      gradeStatus: 'PRELIMINARY', assignedJurors: 3, completedEvaluations: 2, pendingEvaluations: 1,
      finalScore: null, gradeHidden: true,
    },
    {
      projectId: 2, projectCode: null, projectName: 'CivicFlow', participantNames: [], academicCourse: null,
      gradeStatus: 'PENDING', assignedJurors: 2, completedEvaluations: 0, pendingEvaluations: 2,
      finalScore: null, gradeHidden: false,
    },
  ],
  ...overrides,
});

async function read(r: GradesReport) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await buildGradesBuffer(r)) as any);
  return workbook.getWorksheet(GRADES_SHEET)!;
}

describe('grades workbook', () => {
  it('writes the rows with status, counters and "No publicada" for a hidden grade', async () => {
    const sheet = await read(report());

    const first = sheet.getRow(HEADER_ROW + 1).values as any[];
    expect(first.slice(1)).toEqual([
      'C1', 'EcoVision', 'Ana Paz, Luis Ruiz', '1001', 'PF Sistemas', 'Sistemas', 'Preliminar', 2, 3, 1, HIDDEN_GRADE,
    ]);
    expect(sheet.getRow(HEADER_ROW + 2).getCell(7).value).toBe('Evaluación pendiente');
    expect(sheet.getRow(HEADER_ROW + 2).getCell(11).value).toBe(NO_GRADE);
    expect(sheet.getCell(2, 1).value).toBe(visibilityNote(report()));
  });

  it('writes the grade as a number when it is visible', async () => {
    const r = report({ resultsPublished: true });
    r.projects[0] = { ...r.projects[0], gradeStatus: 'OFFICIAL', finalScore: 4.25, gradeHidden: false };

    const sheet = await read(r);

    expect(sheet.getRow(HEADER_ROW + 1).getCell(7).value).toBe('Oficial');
    expect(sheet.getRow(HEADER_ROW + 1).getCell(11).value).toBe(4.25);
  });

  it.each([
    [{ resultsPublished: true }, 'oficiales'],
    [{ gradeVisibility: 'ALL' as const }, 'preliminares'],
    [{}, 'cuando el administrador publique'],
  ])('the note says what the grades are (%o)', (overrides, text) => {
    expect(visibilityNote(report(overrides))).toContain(text);
  });

  it('names the file after the event', () => {
    expect(gradesFileName(report())).toBe('notas_feria_de_proyectos_2026.xlsx');
  });
});
