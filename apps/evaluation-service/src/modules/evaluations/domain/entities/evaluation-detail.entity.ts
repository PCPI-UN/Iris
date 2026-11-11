export class EvaluationDetail {
    constructor(
        public evaluationId: number,
        public criterionId: number,
        public score: number,
        // Effective weight of the criterion in the grade when it was evaluated
        public weight: number = 0,
    ) {}
}
