import { Injectable } from '@nestjs/common';
import { TermRepository } from '@events/domain/repositories/term.repository';
import { Term } from '@events/domain/entities/term.entity';

/** Terms an event can be created or edited with, newest first. */
@Injectable()
export class ListTermsUC {
  constructor(private readonly terms: TermRepository) {}

  execute(): Promise<Term[]> {
    return this.terms.listSelectable();
  }
}
