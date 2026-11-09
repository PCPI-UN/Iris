import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzureBlobUploadService } from '../azure-blob-upload.service';

const CONTAINER = 'posters';

const buildService = (
  account = 'acct',
  overrides: Record<string, string | undefined> = {},
) => {
  const env: Record<string, string | undefined> = {
    AZURE_BLOB_SAS_URL: `https://${account}.blob.core.windows.net/${CONTAINER}?sv=x&sig=y`,
    AZURE_ACCOUNT_NAME: account,
    AZURE_ACCOUNT_KEY: Buffer.from('secret').toString('base64'),
    AZURE_CONTAINER: CONTAINER,
    ...overrides,
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

    it('returns an own URL with a malformed escape untouched instead of throwing', () => {
      const malformed = urlOf('acct', '100%.png');
      expect(() => service.signStoredUrl(malformed)).not.toThrow();
      expect(service.signStoredUrl(malformed)).toBe(malformed);
      expect(service.toStoredUrl(malformed)).toBe(malformed);
    });
  });

  describe('openUrl', () => {
    it('signs a stored blob name with a short-lived read SAS', () => {
      const signed = new URL(service.openUrl('1-poster.png')!);
      expect(`${signed.origin}${signed.pathname}`).toBe(
        urlOf('acct', '1-poster.png'),
      );
      expect(signed.searchParams.get('sp')).toBe('r');
      const expiresIn =
        new Date(signed.searchParams.get('se')!).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(0);
      expect(expiresIn).toBeLessThanOrEqual(5 * 60 * 1000);
    });

    it('signs a legacy URL of our container on the configured account', () => {
      const signed = new URL(
        service.openUrl(urlOf('old', '1-poster.png', '?sig=old'))!,
      );
      expect(signed.hostname).toBe('acct.blob.core.windows.net');
    });

    it('never returns an external URL or another container', () => {
      expect(service.openUrl('https://example.com/poster.png')).toBeNull();
      expect(
        service.openUrl('https://acct.blob.core.windows.net/private/a.png'),
      ).toBeNull();
      expect(service.openUrl('')).toBeNull();
    });

    it('answers 503 when links cannot be signed', () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      try {
        const unsigned = buildService('acct', { AZURE_ACCOUNT_KEY: undefined });
        expect(() => unsigned.openUrl('1-poster.png')).toThrow(
          ServiceUnavailableException,
        );
      } finally {
        logError.mockRestore();
      }
    });
  });

  describe('configuration', () => {
    let logError: jest.SpyInstance;
    const file = {
      originalname: 'poster.png',
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      size: 1,
    } as Express.Multer.File;

    beforeEach(() => {
      logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => logError.mockRestore());

    it('starts without AZURE_BLOB_SAS_URL and rejects uploads with 503', async () => {
      const noUploads = buildService('acct', { AZURE_BLOB_SAS_URL: undefined });
      await expect(noUploads.uploadFile(file)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('AZURE_BLOB_SAS_URL is not set'),
      );
    });

    it('starts without the signing settings, logs them and serves stored values as they are', () => {
      const unsigned = buildService('acct', {
        AZURE_ACCOUNT_KEY: undefined,
        AZURE_CONTAINER: '',
      });
      expect(unsigned.signStoredUrl('1-poster.png')).toBe('1-poster.png');
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('AZURE_ACCOUNT_KEY, AZURE_CONTAINER not set'),
      );
    });

    it('logs when uploads go to a different account or container than the signed links', () => {
      buildService('acct', {
        AZURE_BLOB_SAS_URL: `https://old.blob.core.windows.net/${CONTAINER}?sv=x&sig=y`,
      });
      buildService('acct', {
        AZURE_BLOB_SAS_URL:
          'https://acct.blob.core.windows.net/other?sv=x&sig=y',
      });
      expect(logError).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('new documents will not open'),
      );
    });

    it('starts when the account name is not a valid host and logs it', () => {
      const invalid = buildService('my acct');
      expect(invalid.signStoredUrl('1-poster.png')).toBe('1-poster.png');
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('document links cannot be signed'),
      );
    });

    it('compares the account name without case', () => {
      buildService('acct', {
        AZURE_ACCOUNT_NAME: 'Acct',
      });
      expect(logError).not.toHaveBeenCalled();
    });

    it('logs nothing when the configuration is consistent', () => {
      buildService();
      expect(logError).not.toHaveBeenCalled();
    });
  });
});
