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
  /** Position inside the category; co-winners share it. null when not evaluated */
  position: number | null;
  jurorCount: number;
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
  projects: EvaluationReportProject[];
}
