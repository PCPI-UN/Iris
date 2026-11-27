/** Format of the project template, shared by the parser and the template builder */
export const PROJECT_IMPORT_SHEET = 'Proyectos';
export const PROJECT_IMPORT_MAX_ROWS = 500;
export const PROJECT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** The title and the color legend come first: the headers are searched in the first rows */
export const PROJECT_IMPORT_HEADER_SEARCH_ROWS = 20;
/** Students per project row ("Nombre(s) integrante 1" ... "integrante 6") */
export const PROJECT_IMPORT_MAX_PARTICIPANTS = 6;
/** Tutors per project row ("Correo tutor 1" and "Correo tutor 2") */
export const PROJECT_IMPORT_MAX_TUTORS = 2;

/** Labels of the "Estado" column; an empty cell means APPROVED */
export const PROJECT_IMPORT_STATE_APPROVED = 'Aprobado';
export const PROJECT_IMPORT_STATE_UNDER_REVIEW = 'En revisión';
export const PROJECT_IMPORT_STATE_LABELS = [
  PROJECT_IMPORT_STATE_APPROVED,
  PROJECT_IMPORT_STATE_UNDER_REVIEW,
] as const;

/**
 * Columns that appear once per project row; found by their normalized label, in any order.
 * `required` ones must exist to recognize the headers row; the rest may be missing.
 */
export const PROJECT_IMPORT_FIXED_COLUMNS = [
  { field: 'categoryName', label: 'Categoría', required: true },
  { field: 'nrc', label: 'NRC', required: false },
  { field: 'name', label: 'Nombre del proyecto', required: true },
  { field: 'description', label: 'Descripción', required: false },
  { field: 'projectCode', label: 'Código', required: false },
  { field: 'state', label: 'Estado', required: false },
] as const;

/** Columns repeated per student: "Nombre(s) integrante 1", "Apellido(s) integrante 1"... */
export const PROJECT_IMPORT_PARTICIPANT_COLUMNS = [
  { field: 'firstName', label: 'Nombre(s) integrante' },
  { field: 'lastName', label: 'Apellido(s) integrante' },
  { field: 'email', label: 'Correo integrante' },
  { field: 'studentCode', label: 'Código estudiantil integrante' },
  { field: 'semester', label: 'Semestre integrante' },
  { field: 'career', label: 'Carrera integrante' },
] as const;

/** Column repeated per tutor: "Correo tutor 1", "Correo tutor 2" */
export const PROJECT_IMPORT_TUTOR_COLUMN = { label: 'Correo tutor' } as const;

/**
 * Semester options of the dropdown. Copied from iris-front
 * (features/projects-public/components/wizard-steps/constants-carrers-semesters.ts): keep both in sync.
 */
export const PROJECT_IMPORT_SEMESTERS = [
  { key: '1', label: '1er Semestre' },
  { key: '2', label: '2do Semestre' },
  { key: '3', label: '3er Semestre' },
  { key: '4', label: '4to Semestre' },
  { key: '5', label: '5to Semestre' },
  { key: '6', label: '6to Semestre' },
  { key: '7', label: '7mo Semestre' },
  { key: '8', label: '8vo Semestre' },
  { key: '9', label: '9no Semestre' },
  { key: '10', label: '10mo Semestre' },
  { key: '11', label: '11vo Semestre' },
  { key: '12', label: '12vo Semestre' },
] as const;

/**
 * Career options of the dropdown. Copied from iris-front
 * (features/projects-public/components/wizard-steps/constants-carrers-semesters.ts): keep both in sync.
 */
export const PROJECT_IMPORT_CAREERS = [
  { key: 'administracion_empresas', label: 'Administración de Empresas' },
  { key: 'arquitectura', label: 'Arquitectura' },
  { key: 'ciencias_datos', label: 'Ciencias de Datos' },
  { key: 'comunicacion_social', label: 'Comunicación Social y Periodismo' },
  { key: 'contaduria_publica', label: 'Contaduría Pública' },
  { key: 'derecho', label: 'Derecho' },
  { key: 'diseño_grafico', label: 'Diseño Gráfico' },
  { key: 'diseño_industrial', label: 'Diseño Industrial' },
  { key: 'economia', label: 'Economía' },
  { key: 'enfermeria', label: 'Enfermería' },
  { key: 'ingenieria_biomedica', label: 'Ingeniería Biomedica' },
  { key: 'ingenieria_civil', label: 'Ingeniería Civil' },
  { key: 'ingenieria_electrica', label: 'Ingeniería Eléctrica' },
  { key: 'ingenieria_electronica', label: 'Ingeniería Electrónica' },
  { key: 'ingenieria_industrial', label: 'Ingeniería Industrial' },
  { key: 'ingenieria_mecanica', label: 'Ingeniería Mecánica' },
  { key: 'ingenieria_sistemas', label: 'Ingeniería de Sistemas y Computación' },
  { key: 'matematicas', label: 'Matemáticas' },
  { key: 'medicina', label: 'Medicina' },
  { key: 'odontologia', label: 'Odontología' },
  { key: 'psicologia', label: 'Psicología' },
  { key: 'relaciones_internacionales', label: 'Relaciones Internacionales' },
] as const;
