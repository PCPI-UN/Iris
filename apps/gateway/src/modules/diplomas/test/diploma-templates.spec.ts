import { parseDiplomaTemplates } from '../diploma-templates';

/** CU-86e3wzr68: design of each event, from DIPLOMA_TEMPLATES */
describe('parseDiplomaTemplates', () => {
  it('reads eventId:template pairs, ignoring spaces and empty entries', () => {
    const { templates, invalid } = parseDiplomaTemplates(
      ' 12:engineering-innovation-expo , ,15: feria-proyectos-stem ',
    );

    expect([...templates]).toEqual([
      [12, 'engineering-innovation-expo'],
      [15, 'feria-proyectos-stem'],
    ]);
    expect(invalid).toEqual([]);
  });

  it('has no designs when the variable is unset or empty', () => {
    expect(parseDiplomaTemplates(undefined).templates.size).toBe(0);
    expect(parseDiplomaTemplates('').templates.size).toBe(0);
  });

  it('ignores and reports unknown designs and bad event ids', () => {
    const { templates, invalid } = parseDiplomaTemplates(
      '1:otro-diseno,abc:feria-proyectos-stem,0:feria-proyectos-stem,2,3:feria-proyectos-stem:x,4:feria-proyectos-stem',
    );

    expect([...templates]).toEqual([[4, 'feria-proyectos-stem']]);
    expect(invalid).toEqual([
      '1:otro-diseno',
      'abc:feria-proyectos-stem',
      '0:feria-proyectos-stem',
      '2',
      '3:feria-proyectos-stem:x',
    ]);
  });

  it('keeps the last entry when an event repeats', () => {
    const { templates } = parseDiplomaTemplates(
      '7:engineering-innovation-expo,7:feria-proyectos-stem',
    );
    expect(templates.get(7)).toBe('feria-proyectos-stem');
  });
});
