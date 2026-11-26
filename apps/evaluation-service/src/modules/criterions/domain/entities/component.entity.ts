export class Component {
    constructor(
        public readonly id: number,
        public readonly name: string,
        // Fraction of the grade (0-1); the components of an event add up to 1
        public readonly weight: number,
        public readonly eventId: number,
    ) {}
}
