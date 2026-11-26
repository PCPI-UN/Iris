import { stateChangeBlock } from '../admin-state-change';

describe('stateChangeBlock', () => {
  it('is null without evaluations or published results', () => {
    expect(
      stateChangeBlock({
        evaluationCount: 0,
        resultsPublished: false,
        leavesApproved: true,
      }),
    ).toBeNull();
  });

  it('names both causes and the ranking warning when the project leaves APPROVED', () => {
    expect(
      stateChangeBlock({
        evaluationCount: 1,
        resultsPublished: true,
        leavesApproved: true,
      }),
    ).toEqual({
      hasEvaluations: true,
      evaluationCount: 1,
      resultsPublished: true,
      leavesApproved: true,
      message:
        'No se cambió el estado porque el proyecto ya tiene 1 evaluación de jurados y el evento ya publicó sus resultados. ' +
        'Si el proyecto deja de estar aprobado, sale del ranking y de la plantilla e importación de jurados; sus evaluaciones se conservan. ' +
        'Confirma el cambio para aplicarlo de todas formas.',
    });
  });
});
