import { ConfigService } from '@nestjs/config';
import { AzureBlobUploadService } from '../azure-blob-upload.service';

const CONTAINER = 'posters';

const buildService = (account = 'acct') => {
  const env: Record<string, string> = {
    AZURE_BLOB_SAS_URL: `https://${account}.blob.core.windows.net/${CONTAINER}?sv=x&sig=y`,
    AZURE_ACCOUNT_NAME: account,
    AZURE_ACCOUNT_KEY: Buffer.from('secret').toString('base64'),
    AZURE_CONTAINER: CONTAINER,
  };
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
  return new AzureBlobUploadService(config);
};

const urlOf = (account: string, blob: string, query = '') =>
  `https://${account}.blob.core.windows.net/${CONTAINER}/${blob}${query}`;

describe('AzureBlobUploadService document URLs', () => {
  let service: AzureBlobUploadService;

  beforeEach(() => {
    service = buildService();
  });

  describe('toStoredUrl', () => {
    it('reduces an own blob URL with SAS to its blob name', () => {
      const url = urlOf('acct', '1-poster%20final.png', '?sv=2024&sig=abc');
      expect(service.toStoredUrl(url)).toBe('1-poster final.png');
    });

    it('reduces an own blob URL from another account to its blob name', () => {
      expect(service.toStoredUrl(urlOf('old', '1-poster.png'))).toBe(
        '1-poster.png',
      );
    });

    it('leaves a blob name untouched', () => {
      expect(service.toStoredUrl('1-poster.png')).toBe('1-poster.png');
    });

    it('leaves external URLs and other containers untouched', () => {
      const external = 'https://example.com/poster.png?token=1';
      const otherContainer = 'https://acct.blob.core.windows.net/private/a.png';
      expect(service.toStoredUrl(external)).toBe(external);
      expect(service.toStoredUrl(otherContainer)).toBe(otherContainer);
    });
  });

  describe('signStoredUrl', () => {
    it('rebuilds a blob name on the configured account with a read-only SAS', () => {
      const signed = new URL(service.signStoredUrl('1-poster.png'));
      expect(`${signed.origin}${signed.pathname}`).toBe(
        urlOf('acct', '1-poster.png'),
      );
      expect(signed.searchParams.get('sp')).toBe('r');
      expect(signed.searchParams.get('sig')).toBeTruthy();
      expect(
        new Date(signed.searchParams.get('se')!).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it('keeps names with spaces or accents working', () => {
      const signed = service.signStoredUrl('1-póster final.png');
      expect(
        signed.startsWith(urlOf('acct', '1-p%C3%B3ster%20final.png', '?')),
      ).toBe(true);
    });

    it('follows the configured account: the same blob name resolves to the new host', () => {
      const moved = buildService('newacct');
      const signed = new URL(moved.signStoredUrl('1-poster.png'));
      expect(signed.hostname).toBe('newacct.blob.core.windows.net');
    });

    it('re-signs a legacy URL stored with host and an expired SAS', () => {
      const legacy = urlOf(
        'old',
        '1-poster.png',
        '?sv=2024&se=2025-11-24T00%3A00%3A00Z&sp=r&sig=old',
      );
      const signed = new URL(service.signStoredUrl(legacy));
      expect(signed.hostname).toBe('acct.blob.core.windows.net');
      expect(signed.searchParams.get('sig')).not.toBe('old');
      expect(
        new Date(signed.searchParams.get('se')!).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it('returns external URLs and empty values untouched', () => {
      const external = 'https://example.com/poster.png';
      const otherContainer = 'https://acct.blob.core.windows.net/private/a.png';
      expect(service.signStoredUrl(external)).toBe(external);
      expect(service.signStoredUrl(otherContainer)).toBe(otherContainer);
      expect(service.signStoredUrl('')).toBe('');
    });
  });
});
