import { ConfigService } from '@nestjs/config';
import { AzureBlobUploadService } from '../azure-blob-upload.service';

const ACCOUNT = 'acct';
const CONTAINER = 'posters';
const BASE = `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}`;

const buildService = (overrides: Record<string, string> = {}) => {
  const env: Record<string, string> = {
    AZURE_BLOB_SAS_URL: `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}?sv=x&sig=y`,
    AZURE_ACCOUNT_NAME: ACCOUNT,
    AZURE_ACCOUNT_KEY: Buffer.from('secret').toString('base64'),
    AZURE_CONTAINER: CONTAINER,
    ...overrides,
  };
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
  return new AzureBlobUploadService(config);
};

describe('AzureBlobUploadService document URLs', () => {
  let service: AzureBlobUploadService;

  beforeEach(() => {
    service = buildService();
  });

  describe('toStoredUrl', () => {
    it('strips the SAS query from an own blob URL', () => {
      expect(
        service.toStoredUrl(
          `${BASE}/1-poster.png?sv=2024&se=2026-11-24&sig=abc`,
        ),
      ).toBe(`${BASE}/1-poster.png`);
    });

    it('leaves foreign URLs untouched', () => {
      const url = 'https://example.com/poster.png?token=1';
      expect(service.toStoredUrl(url)).toBe(url);
    });
  });

  describe('signStoredUrl', () => {
    it('signs a permanent blob URL with a read-only SAS', () => {
      const signed = new URL(service.signStoredUrl(`${BASE}/1-poster.png`));
      expect(`${signed.origin}${signed.pathname}`).toBe(`${BASE}/1-poster.png`);
      expect(signed.searchParams.get('sp')).toBe('r');
      expect(signed.searchParams.get('sig')).toBeTruthy();
    });

    it('replaces the signature of a legacy URL stored with a SAS', () => {
      const legacy = `${BASE}/1-poster.png?sv=2024&se=2025-11-24T00%3A00%3A00Z&sp=r&sig=old`;
      const signed = new URL(service.signStoredUrl(legacy));
      expect(signed.searchParams.get('sig')).not.toBe('old');
      expect(
        new Date(signed.searchParams.get('se')!).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it('keeps names with spaces or accents working', () => {
      const signed = service.signStoredUrl(`${BASE}/1-p%C3%B3ster%20final.png`);
      expect(signed.startsWith(`${BASE}/1-p%C3%B3ster%20final.png?`)).toBe(
        true,
      );
    });

    it('does not sign URLs from another account or container', () => {
      const other = 'https://other.blob.core.windows.net/posters/a.png';
      const otherContainer = `https://${ACCOUNT}.blob.core.windows.net/private/a.png`;
      expect(service.signStoredUrl(other)).toBe(other);
      expect(service.signStoredUrl(otherContainer)).toBe(otherContainer);
    });

    it('returns non-URL values untouched', () => {
      expect(service.signStoredUrl('not a url')).toBe('not a url');
    });
  });
});
