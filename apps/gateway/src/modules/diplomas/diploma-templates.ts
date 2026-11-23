/**
 * Diploma designs (CU-86e3wzr68). Each design is a full A4 landscape PNG exported from
 * Canva with everything printed on it (event title, signature, date); only the project
 * name is drawn on top.
 */
export const DIPLOMA_TEMPLATES = [
  'engineering-innovation-expo',
  'feria-proyectos-stem',
] as const;

export type DiplomaTemplate = (typeof DIPLOMA_TEMPLATES)[number];

export interface DiplomaTemplateConfig {
  /** Event id -> design */
  templates: Map<number, DiplomaTemplate>;
  /** Entries that were ignored, to log them */
  invalid: string[];
}

/**
 * Reads `DIPLOMA_TEMPLATES`: comma-separated `eventId:template` pairs, such as
 * `12:engineering-innovation-expo,15:feria-proyectos-stem`. The event ids change per
 * environment, so they live in the configuration. An entry with an unknown design or a
 * bad event id is ignored and reported in `invalid`; when an event id repeats, the last
 * entry wins.
 */
export function parseDiplomaTemplates(
  raw: string | undefined,
): DiplomaTemplateConfig {
  const templates = new Map<number, DiplomaTemplate>();
  const invalid: string[] = [];

  for (const entry of (raw ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const [id, template, ...rest] = trimmed.split(':').map((p) => p.trim());
    const eventId = Number(id);
    if (
      rest.length > 0 ||
      !/^\d+$/.test(id) ||
      eventId <= 0 ||
      !isDiplomaTemplate(template)
    ) {
      invalid.push(trimmed);
      continue;
    }
    templates.set(eventId, template);
  }

  return { templates, invalid };
}

function isDiplomaTemplate(
  value: string | undefined,
): value is DiplomaTemplate {
  return (DIPLOMA_TEMPLATES as readonly string[]).includes(value ?? '');
}
