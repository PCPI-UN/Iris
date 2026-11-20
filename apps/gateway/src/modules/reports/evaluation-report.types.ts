/**
 * Data of the evaluation report of one category of an event (CU-86e3vmz0b,
 * IRIS-V3-REP-01). The Excel follows the format approved on 28 Oct
 * (Reporte_Evaluacion_Feria_Proyectos.xlsx): one summary row per project and one
 * detail row per criterion.
 */

export interface EvaluationReportCriterion {
  criterionId: number;
  criterion: string;
  /** Effective weight the criterion had in the grade (fraction, 0-1) */
  weight: number;
  /** Average of the jurors' scores for the criterion */
  score: number;
}

export interface EvaluationReportComponent {
  component: string;
  /** Sum of the effective weights of its criteria (fraction, 0-1) */
  weight: number;
  criteria: EvaluationReportCriterion[];
}

export interface EvaluationReportProject {
  /** Row number in the report (the "Código" column), following the order of the rows */
  rowNumber: number;
  projectId: number;
  projectCode?: string;
  projectName: string;
  participantNames: string[];
  /** false when no juror has evaluated the project; it has no grade nor position then */
  evaluated: boolean;
  /** Average of the jurors' grades, rounded as the ranking does */
  finalScore: number | null;
  /**
   * Position inside the category; co-winners share it. null when not evaluated, or in a
   * filtered report of an event without ranking configuration
   */
  position: number | null;
  /** How many jurors evaluated the project; null in the student's report (never shown to them) */
  jurorCount: number | null;
  /** Each juror's comment, without saying who wrote it; empty when there are none */
  comments: string[];
  components: EvaluationReportComponent[];
}

export interface EvaluationReport {
  eventId: number;
  eventName: string;
  categoryId: number;
  categoryName: string;
  /** Highest grade possible with the event's evaluation type */
  maxScore: number;
  generatedAt: Date;
  /** false in the student's report: the "N° de Jurados" column is left out */
  showJurorCount: boolean;
  /**
   * false in a report filtered to a scope or to the student's project when the event has
   * no ranking configuration: the "Posición" column is left out
   */
  showPositions: boolean;
  projects: EvaluationReportProject[];
}

/**
 * Rows a caller may see (CU-86e3vmz0c). Positions are always computed over the whole
 * category, so a filtered report shows the real position of each project.
 */
export interface EvaluationReportScope {
  /** Only these projects are listed; every approved project of the category when absent */
  projectIds?: number[];
  /** false for the student's report; true by default */
  showJurorCount?: boolean;
  /** false when the event has no ranking configuration (filtered reports); true by default */
  showPositions?: boolean;
}
