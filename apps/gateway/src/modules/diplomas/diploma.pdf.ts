import { readFileSync } from 'fs';
import { join } from 'path';
// pdfkit is CommonJS (`module.exports = PDFDocument`) and this project has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { DiplomaTemplate } from './diploma-templates';
import { fitProjectName } from './diploma-layout';

/**
 * Where the PNG designs and the font are read from. `nest build` copies `assets/` next to
 * the bundle (nest-cli.json), and the gateway runs from the repository root.
 */
export const DIPLOMA_ASSETS_DIR = 'dist/apps/gateway/modules/diplomas/assets';

const FONT_FILE = 'Montserrat-BoldItalic.ttf';
const FONT_NAME = 'diploma-name';

/** A4 landscape, in points: the designs are 2000x1414 px, the same ratio */
const PAGE = { width: 841.89, height: 595.28 };
/** Points per pixel of the design */
const SCALE = PAGE.width / 2000;

/**
 * Blank space of the design between "LE OTORGA UNA ESPECIAL DISTINCIÓN AL PROYECTO"
 * (ends at y=572 px) and the gold line (x 325-1674 px, y=780 px), in points. Both designs
 * share the layout.
 */
const NAME_BOX = {
  x: 325 * SCALE,
  width: (1674 - 325) * SCALE,
  centerY: ((572 + 780) / 2) * SCALE,
};

/** Wine of the design titles */
const NAME_COLOR = '#4E1919';
const LINE_HEIGHT = 1.15;

export interface DiplomaData {
  template: DiplomaTemplate;
  projectName: string;
}

/** Renders the diploma of a project: the event design with the project name on it */
export class DiplomaPdfRenderer {
  /** Files are read on first use and kept: a missing asset fails the download, not the gateway start */
  private readonly files = new Map<string, Buffer>();

  constructor(private readonly assetsDir = DIPLOMA_ASSETS_DIR) {}

  async render({ template, projectName }: DiplomaData): Promise<Buffer> {
    // Read first: a missing asset rejects before any PDF is started
    const design = this.asset(`${template}.png`);
    const font = this.asset(FONT_FILE);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: `Diploma - ${projectName}`,
        Author: 'Universidad del Norte - División de Ingenierías',
        Creator: 'Iris',
      },
    });
    const done = collect(doc);

    doc.image(design, 0, 0, { width: PAGE.width, height: PAGE.height });

    doc.registerFont(FONT_NAME, font);
    doc.font(FONT_NAME).fillColor(NAME_COLOR);
    const { lines, fontSize } = fitProjectName(
      projectName,
      (text, size) => doc.fontSize(size).widthOfString(text),
      {
        maxWidth: NAME_BOX.width,
        maxLines: 2,
        maxFontSize: 30,
        minFontSize: 16,
      },
    );

    doc.fontSize(fontSize);
    const lineHeight = fontSize * LINE_HEIGHT;
    let y = NAME_BOX.centerY - (lines.length * lineHeight) / 2;
    for (const line of lines) {
      // Each line already fits the width, so pdfkit only centers it
      doc.text(line, NAME_BOX.x, y, { width: NAME_BOX.width, align: 'center' });
      y += lineHeight;
    }

    doc.end();
    return await done;
  }

  /** Two PNG of ~400 KB and one font of ~340 KB, kept in memory once read */
  private asset(file: string): Buffer {
    let content = this.files.get(file);
    if (!content) {
      content = readFileSync(join(this.assetsDir, file));
      this.files.set(file, content);
    }
    return content;
  }
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
