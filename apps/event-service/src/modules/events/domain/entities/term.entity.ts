/** Id of the "no term" row that holds the events created before terms existed. */
export const NO_TERM_ID = -1;

/**
 * Academic term: year and period code (2026 + "10" is the term 202610). The NRC of a
 * course section repeats across terms, so (term, NRC) identifies one section.
 */
export class Term {
  constructor(
    public id: number,
    public year: number,
    public period: string,
    public createdAt?: Date,
    public updatedAt?: Date,
  ) {}
}
