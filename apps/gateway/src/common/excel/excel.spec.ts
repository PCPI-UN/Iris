import { fileNamePart, xlsxFile, XLSX_CONTENT_TYPE } from './xlsx-file';
import { solidFill, thinBorder } from './excel-styles';

describe('fileNamePart', () => {
  it.each([
    ['Dpto. Ingeniería Civil y Ambiental', 'dpto_ingenieria_civil_y_ambiental'],
    ['Año Ñandú', 'ano_nandu'],
    ['  __Hola!!  ', 'hola'],
    ['', 'general'],
    ['¡¡!!', 'general'],
  ])('%j -> %j', (input, expected) => {
    expect(fileNamePart(input)).toBe(expected);
  });
});

describe('xlsxFile', () => {
  it('sets type, disposition and length', () => {
    const file = xlsxFile(Buffer.from('abc'), 'a.xlsx');
    expect(file.getHeaders()).toEqual({
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="a.xlsx"',
      length: 3,
    });
  });
});

describe('excel styles', () => {
  it('solidFill', () => {
    expect(solidFill('FF000000')).toEqual({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF000000' },
    });
  });

  it('thinBorder', () => {
    const side = { style: 'thin', color: { argb: 'FF111111' } };
    expect(thinBorder('FF111111')).toEqual({
      top: side,
      left: side,
      bottom: side,
      right: side,
    });
  });
});
