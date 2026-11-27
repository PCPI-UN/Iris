/** Trimmed, single-spaced, lowercase and without accents: "Dpt.  Ingeniería" -> "dpt. ingenieria" */
export const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
