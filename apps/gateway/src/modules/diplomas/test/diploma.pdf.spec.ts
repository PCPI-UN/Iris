import { join } from 'path';
import { DiplomaPdfRenderer } from '../diploma.pdf';
import { DIPLOMA_TEMPLATES } from '../diploma-templates';

/** CU-86e3wzr68: the real designs and font render into a PDF */
describe('DiplomaPdfRenderer', () => {
  const assetsDir = join(__dirname, '..', 'assets');

  it.each(DIPLOMA_TEMPLATES)('renders the %s design', async (template) => {
    const pdf = await new DiplomaPdfRenderer(assetsDir).render({
      template,
      projectName:
        'Plataforma colaborativa para la gestión de residuos sólidos',
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    // The PNG design is embedded
    expect(pdf.length).toBeGreaterThan(100_000);
  });

  it('fails the download, not the start, when an asset is missing', async () => {
    const renderer = new DiplomaPdfRenderer(join(assetsDir, 'missing'));

    await expect(
      renderer.render({
        template: 'feria-proyectos-stem',
        projectName: 'Riego IoT',
      }),
    ).rejects.toThrow(/ENOENT/);
  });
});
