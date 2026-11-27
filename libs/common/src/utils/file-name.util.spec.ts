import { decodeOriginalName } from './file-name.util';

describe('decodeOriginalName', () => {
  it('re-reads as UTF-8 a name multer decoded as latin1', () => {
    const asMulterReadsIt = Buffer.from('Pendón.pdf', 'utf8').toString(
      'latin1',
    );
    expect(decodeOriginalName(asMulterReadsIt)).toBe('Pendón.pdf');
  });

  it('keeps a name that already came decoded', () => {
    expect(decodeOriginalName('海报.pdf')).toBe('海报.pdf');
  });

  it('keeps a plain ASCII name', () => {
    expect(decodeOriginalName('feria.xlsx')).toBe('feria.xlsx');
  });
});
