import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  BlockBlobClient,
  BlobSASPermissions,
  ContainerClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import * as path from 'path';

/** Matches values that carry a scheme, e.g. https://… (blob names never do) */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Lifetime of the read signature added when a document is served */
const READ_SAS_TTL_SEC = 3600;

/**
 * Lifetime of the signature behind a stable document link. The redirect is
 * followed right away, but PDF viewers and media players keep requesting byte
 * ranges of the same URL while the document stays open.
 */
const OPEN_SAS_TTL_SEC = 3600;

const STORAGE_UNAVAILABLE = 'Document storage is not configured';

export interface AzureBlobUploadResponse {
  blobName: string;
  filename: string;
  mimetype: string;
  size: number;
}

interface ReadSigner {
  credential: StorageSharedKeyCredential;
  container: ContainerClient;
}

/**
 * Uploads project documents and signs read URLs for them.
 *
 * Missing or inconsistent Azure settings do not stop the gateway: they are
 * logged once at startup, and only the document operations that need them
 * fail (503) or fall back to the stored value.
 */
@Injectable()
export class AzureBlobUploadService {
  private readonly logger = new Logger(AzureBlobUploadService.name);
  private readonly containerName: string;
  /** Where uploads go, from AZURE_BLOB_SAS_URL */
  private readonly uploadContainer: ContainerClient | null = null;
  /** Signs read URLs, from AZURE_ACCOUNT_NAME, AZURE_ACCOUNT_KEY and AZURE_CONTAINER */
  private readonly signer: ReadSigner | null = null;

  constructor(private readonly configService: ConfigService) {
    const sasUrl = this.setting('AZURE_BLOB_SAS_URL');
    const accountName = this.setting('AZURE_ACCOUNT_NAME');
    const accountKey = this.setting('AZURE_ACCOUNT_KEY');
    this.containerName = this.setting('AZURE_CONTAINER');

    if (!sasUrl) {
      this.logger.error(
        'AZURE_BLOB_SAS_URL is not set: document uploads are disabled',
      );
    } else {
      try {
        // The SAS URL points to the container, so '' is that container
        this.uploadContainer = new BlobServiceClient(sasUrl).getContainerClient(
          '',
        );
      } catch (err) {
        this.logger.error(
          `AZURE_BLOB_SAS_URL is invalid, document uploads are disabled: ${(err as Error).message}`,
        );
      }
    }

    const missing = Object.entries({
      AZURE_ACCOUNT_NAME: accountName,
      AZURE_ACCOUNT_KEY: accountKey,
      AZURE_CONTAINER: this.containerName,
    })
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length) {
      this.logger.error(
        `${missing.join(', ')} not set: document links cannot be signed`,
      );
    } else {
      try {
        const credential = new StorageSharedKeyCredential(
          accountName,
          accountKey,
        );
        this.signer = {
          credential,
          container: new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            credential,
          ).getContainerClient(this.containerName),
        };
      } catch (err) {
        this.logger.error(
          `AZURE_ACCOUNT_NAME or AZURE_CONTAINER is invalid, document links cannot be signed: ${(err as Error).message}`,
        );
      }
    }

    if (sasUrl && this.uploadContainer && this.signer) {
      this.warnIfUploadsAreNotSigned(sasUrl, accountName);
    }
  }

  private setting(key: string): string {
    return this.configService.get<string>(key)?.trim() ?? '';
  }

  /**
   * Uploads land in the container of AZURE_BLOB_SAS_URL, while links are signed
   * for AZURE_ACCOUNT_NAME and AZURE_CONTAINER. If they differ, new documents
   * are stored where their links do not point.
   */
  private warnIfUploadsAreNotSigned(sasUrl: string, accountName: string) {
    let uploadAccount = '';
    let uploadContainer = '';
    try {
      const url = new URL(sasUrl);
      uploadAccount = url.hostname.split('.')[0];
      uploadContainer = decodeURIComponent(url.pathname.split('/')[1] ?? '');
    } catch {
      // An unparsable SAS URL was already reported by the client constructor
    }

    // Host names are case-insensitive; container names are always lowercase
    if (
      uploadAccount !== accountName.toLowerCase() ||
      uploadContainer !== this.containerName
    ) {
      this.logger.error(
        `Uploads go to ${uploadAccount}/${uploadContainer} (AZURE_BLOB_SAS_URL) ` +
          `but links are signed for ${accountName}/${this.containerName} ` +
          `(AZURE_ACCOUNT_NAME, AZURE_CONTAINER): new documents will not open`,
      );
    }
  }

  /**
   * Uploads a file directly to Azure Blob Storage
   * @param file - The file to upload
   * @returns The upload response containing blobName, filename, and other metadata
   */
  async uploadFile(
    file: Express.Multer.File,
  ): Promise<AzureBlobUploadResponse> {
    if (!this.uploadContainer) {
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    }

    try {
      const blobName = `${Date.now()}-${path.basename(file.originalname)}`;
      const blockBlobClient: BlockBlobClient =
        this.uploadContainer.getBlockBlobClient(blobName);

      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });

      this.logger.log(
        `File uploaded successfully: ${file.originalname} -> ${blobName}`,
      );

      return {
        blobName,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload file ${file.originalname}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to upload file to Azure Blob Storage: ${error.message}`,
      );
    }
  }

  /**
   * Value to persist for a document. A URL that points to our container
   * (with or without SAS, on any storage account) is reduced to its blob name,
   * so the account only lives in the configuration. Blob names and URLs from
   * other places are returned untouched.
   */
  toStoredUrl(value: string): string {
    return this.extractBlobName(value) ?? value;
  }

  /**
   * Public URL for a stored document value:
   * - a blob name is rebuilt on the configured account and signed for reading
   * - a URL to our container (legacy rows stored with host and SAS) is reduced
   *   to its blob name and signed the same way
   * - any other value (external URL, empty) is returned untouched
   */
  signStoredUrl(value: string, ttlSec: number = READ_SAS_TTL_SEC): string {
    if (!this.signer) return value;
    const blobName = this.blobNameOf(value);
    return blobName ? this.generateReadSasUrl(blobName, ttlSec) : value;
  }

  /**
   * Signed URL for the stable document link, or null when the stored value is
   * not a file of our container (external URL, empty). Never returns an
   * external URL, so the stable link cannot redirect elsewhere.
   */
  openUrl(value: string): string | null {
    if (!this.signer) {
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    }
    const blobName = this.blobNameOf(value);
    return blobName
      ? this.generateReadSasUrl(blobName, OPEN_SAS_TTL_SEC)
      : null;
  }

  /**
   * Blob name behind a stored document value: the value itself when it is a
   * bare name, the name inside a URL of our container, or null otherwise.
   */
  private blobNameOf(value: string): string | null {
    if (!value) return null;
    return ABSOLUTE_URL.test(value) ? this.extractBlobName(value) : value;
  }

  /**
   * Blob name of a URL that points to our container on an Azure blob host,
   * or null for any other URL.
   */
  private extractBlobName(value: unknown): string | null {
    if (typeof value !== 'string' || !this.containerName) return null;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }

    const prefix = `/${this.containerName}/`;
    if (
      !parsed.hostname.endsWith('.blob.core.windows.net') ||
      !parsed.pathname.startsWith(prefix)
    ) {
      return null;
    }

    // A malformed escape (e.g. "100%.png") is not one of our blob URLs
    try {
      return decodeURIComponent(parsed.pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }

  /** Read-only signed URL of a blob in our container. */
  private generateReadSasUrl(blobName: string, ttlSec: number): string {
    if (!this.signer)
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);

    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: new Date(Date.now() + Math.max(60, ttlSec) * 1000),
      },
      this.signer.credential,
    ).toString();

    return `${this.signer.container.getBlockBlobClient(blobName).url}?${sas}`;
  }
}
