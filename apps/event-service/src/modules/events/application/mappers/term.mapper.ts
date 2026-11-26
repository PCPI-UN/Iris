import { ListTermsResponse, TermProto } from '@app/common/generated/event';
import { Term } from '@events/domain/entities/term.entity';

export class TermMapper {
  static toTermProto(term: Term): TermProto {
    return { id: term.id, year: term.year, period: term.period };
  }

  static toListTermsResponse(terms: Term[]): ListTermsResponse {
    return { terms: terms.map((term) => this.toTermProto(term)) };
  }
}
