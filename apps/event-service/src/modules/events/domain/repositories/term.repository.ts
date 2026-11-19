import { Term } from '../entities/term.entity';

export abstract class TermRepository {
  abstract create(data: { year: number; period: string }): Promise<Term>;
  /** Any term, the "no term" row included. */
  abstract findById(id: number): Promise<Term | null>;
  abstract findByYearAndPeriod(year: number, period: string): Promise<Term | null>;
  /** Every term except the "no term" row, newest first (year, then period). */
  abstract listSelectable(): Promise<Term[]>;
}
