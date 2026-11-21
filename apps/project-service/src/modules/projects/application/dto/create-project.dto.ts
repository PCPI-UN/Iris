import { ProjectState } from '../../domain/entities/project.entity';
export interface CreateProjectDTO {
  eventId: number;    // Evento al que pertenece el proyecto
  courseId: number;
  name: string;
  projectCode?: string; // Código opcional del proyecto
  description?: string;
  eventNumber?: string; // Identificación de la mesa/stand
  state?: ProjectState;
  /** NRC of the course section, looked up in the term of the event; ignored when the event does not require one */
  nrc?: string;
}
