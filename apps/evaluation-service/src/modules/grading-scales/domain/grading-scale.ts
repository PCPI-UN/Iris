/** Number of levels every grading scale has. The juror always picks a level from 1 to this value. */
export const GRADING_SCALE_LEVELS = 4;

export const MAX_SCALE_NAME_LENGTH = 100;
export const MAX_LEVEL_LABEL_LENGTH = 50;
/** Points are stored as DECIMAL(7, 2). */
export const MAX_LEVEL_POINTS = 99999.99;

/** Codes of the read-only system scales; they match the former evaluation types. */
export enum SystemScaleCode {
    FINAL_PROJECTS = 'FINAL_PROJECTS',
    ZERO_TO_FIVE = 'ZERO_TO_FIVE',
    ZERO_TO_HUNDRED = 'ZERO_TO_HUNDRED',
}

/** Scale an event gets when nothing else is chosen ("Proyectos finales"). */
export const DEFAULT_SCALE_CODE = SystemScaleCode.FINAL_PROJECTS;

export interface GradingScaleLevel {
    level: number;
    label: string;
    points: number;
}

export interface GradingScale {
    id: number;
    name: string;
    description: string | null;
    isSystem: boolean;
    code: string | null;
    createdByUserId: number | null;
    createdAt: Date;
    /** Sorted by level, from 1 to 4. */
    levels: GradingScaleLevel[];
}

/** Data of a new scale or of an edited one. */
export interface GradingScaleInput {
    name: string;
    description?: string | null;
    levels: GradingScaleLevel[];
}
