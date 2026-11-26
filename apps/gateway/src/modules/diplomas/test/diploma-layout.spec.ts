import { fitProjectName, MeasureText } from '../diploma-layout';

/** CU-86e3wzr68: the project name always fits the blank space of the design */
describe('fitProjectName', () => {
  // Monospaced stand-in for the PDF font: every character is half the font size wide
  const measure: MeasureText = (text, size) => text.length * size * 0.5;
  const options = {
    maxWidth: 100,
    maxLines: 2,
    maxFontSize: 20,
    minFontSize: 10,
  };

  it('keeps a short name on one line at the biggest size', () => {
    expect(fitProjectName('Riego IoT', measure, options)).toEqual({
      lines: ['Riego IoT'],
      fontSize: 20,
    });
  });

  it('collapses spaces', () => {
    expect(fitProjectName('  Riego \n  IoT ', measure, options).lines).toEqual([
      'Riego IoT',
    ]);
  });

  it('wraps into two lines before shrinking below what is needed', () => {
    // 20 characters: at 20 pt one line fits 10 characters, so two lines of 10
    const layout = fitProjectName('Sistema de riego IoT', measure, options);
    expect(layout).toEqual({
      lines: ['Sistema de', 'riego IoT'],
      fontSize: 20,
    });
  });

  it('shrinks the font when two lines are not enough', () => {
    // "inteligente" alone needs 18 pt, and three lines are needed down to 11 pt
    const layout = fitProjectName(
      'Sistema inteligente de riego',
      measure,
      options,
    );
    expect(layout).toEqual({
      lines: ['Sistema inteligente', 'de riego'],
      fontSize: 10,
    });
  });

  it('cuts a name that does not fit even at the smallest size with an ellipsis', () => {
    // At 10 pt a line fits 20 characters
    const name =
      'Plataforma colaborativa para la gestión integral de residuos sólidos urbanos';
    const layout = fitProjectName(name, measure, options);

    expect(layout.fontSize).toBe(10);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1].endsWith('…')).toBe(true);
    for (const line of layout.lines) {
      expect(measure(line, 10)).toBeLessThanOrEqual(100);
    }
  });

  it('cuts a single word longer than the line', () => {
    const layout = fitProjectName('A'.repeat(60), measure, options);
    expect(layout.fontSize).toBe(10);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[0]).toBe('A'.repeat(20));
    expect(layout.lines[1]).toBe(`${'A'.repeat(19)}…`);
  });

  it('returns no lines for an empty name', () => {
    expect(fitProjectName('   ', measure, options).lines).toEqual([]);
  });
});
