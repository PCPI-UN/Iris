/** Basic data and category of a project; the state is not editable here. */
export interface UpdateProjectDTO {
  id: number;
  name?: string;
  projectCode?: string | null; // Código opcional del proyecto
  description?: string | null;
  eventNumber?: string | null;
  courseId?: number;
}

/** Values the fields must still hold for the write to apply (optimistic check). */
export type UpdateProjectExpected = Partial<Omit<UpdateProjectDTO, 'id'>>;
