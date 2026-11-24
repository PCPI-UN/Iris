/** Width of `text` in points at `fontSize`, as the PDF font measures it */
export type MeasureText = (text: string, fontSize: number) => number;

export interface NameLayoutOptions {
  maxWidth: number;
  maxLines: number;
  maxFontSize: number;
  minFontSize: number;
}

export interface NameLayout {
  lines: string[];
  fontSize: number;
}

const ELLIPSIS = '…';

/**
 * Fits the project name in the blank space of the diploma: the biggest font size, from
 * `maxFontSize` down to `minFontSize`, at which the name wraps by words into at most
 * `maxLines` lines no wider than `maxWidth`. If it does not fit even at the smallest
 * size, the last line is cut with an ellipsis. Spaces are collapsed.
 */
export function fitProjectName(
  name: string,
  measure: MeasureText,
  options: NameLayoutOptions,
): NameLayout {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], fontSize: options.maxFontSize };

  for (let size = options.maxFontSize; size >= options.minFontSize; size--) {
    const lines = wrapWords(words, (t) => measure(t, size), options.maxWidth);
    if (lines && lines.length <= options.maxLines) {
      return { lines, fontSize: size };
    }
  }

  const size = options.minFontSize;
  return {
    lines: truncateLines(words, (t) => measure(t, size), options),
    fontSize: size,
  };
}

/** Greedy word wrap; null when one word alone is wider than the line */
function wrapWords(
  words: string[],
  width: (text: string) => number,
  maxWidth: number,
): string[] | null {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (width(word) > maxWidth) return null;
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/** Fills `maxLines` lines character by character and ends the last one with an ellipsis */
function truncateLines(
  words: string[],
  width: (text: string) => number,
  { maxWidth, maxLines }: NameLayoutOptions,
): string[] {
  const lines: string[] = [];
  let rest = words.join(' ');

  while (rest && lines.length < maxLines) {
    const isLast = lines.length === maxLines - 1;
    let line = longestPrefix(rest, width, maxWidth);
    // Prefer to break between words when the line is not the last one
    if (!isLast && line.length < rest.length) {
      const space = line.lastIndexOf(' ');
      if (space > 0) line = line.slice(0, space);
    }
    rest = rest.slice(line.length).trim();
    if (isLast && rest) {
      line = longestPrefix(
        `${line} ${rest}`,
        (t) => width(t + ELLIPSIS),
        maxWidth,
      )
        .trimEnd()
        .concat(ELLIPSIS);
      rest = '';
    }
    lines.push(line.trim());
  }
  return lines;
}

function longestPrefix(
  text: string,
  width: (text: string) => number,
  maxWidth: number,
): string {
  let end = text.length;
  while (end > 1 && width(text.slice(0, end)) > maxWidth) end--;
  return text.slice(0, end);
}
