/** A category of an event (the "course" a project is registered in). */
export class EventCategory {
  constructor(
    public readonly id: number,
    public readonly eventId: number,
    public readonly name: string,
    public readonly description: string | null,
    public readonly active: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
