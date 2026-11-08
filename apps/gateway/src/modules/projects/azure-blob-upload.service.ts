import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  BlockBlobClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import * as path from 'path';



/** Matches values that carry a scheme, e.g. https://… (blob names never do) */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Lifetime of the read signature added when a document is served */
const READ_SAS_TTL_SEC = 3600;

export interface AzureBlobUploadResponse {
  blobName: string;
  filename: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class AzureBlobUploadService {
  private readonly logger = new Logger(AzureBlobUploadService.name);
  private containerClient;
  private accountName: string;
  private accountKey: string;
  private containerName: string;

  constructor(private readonly configService: ConfigService) {
  const sasUrl = this.configService.get<string>('AZURE_BLOB_SAS_URL');
  if (!sasUrl) {
    throw new Error('AZURE_BLOB_SAS_URL is not defined in environment variables');
  }

  console.log('🔵 SAS URL recibido:', sasUrl);


  this.accountName = this.configService.get<string>('AZURE_ACCOUNT_NAME') || '';
  this.accountKey = this.configService.get<string>('AZURE_ACCOUNT_KEY') || '';
  this.containerName = this.configService.get<string>('AZURE_CONTAINER', '');

  try {
    const blobServiceClient = new BlobServiceClient(sasUrl);

    // IMPRIME EL CONTENEDOR
    console.log('🟦 Intentando extraer containerName...');
    // Esto revienta si el SAS no tiene contenedor
    const containerClient = blobServiceClient.getContainerClient('');

    console.log('🟢 containerClient.containerName =', containerClient.containerName);

    this.containerClient = containerClient;
  } catch (err) {
    console.error('❌ Error al inicializar AzureBlobUploadService:', err.message);
    throw err;
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
    try {
      const blobName = `${Date.now()}-${path.basename(file.originalname)}`;
      const blockBlobClient: BlockBlobClient =
        this.containerClient.getBlockBlobClient(blobName);

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
    if (!value || !this.accountName || !this.accountKey) return value;

    const blobName = ABSOLUTE_URL.test(value)
      ? this.extractBlobName(value)
      : value;

    return blobName ? this.generateReadSasUrl(blobName, ttlSec) : value;
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
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  }

  /**
   * Generates a SAS URL for reading a blob
   * @param blobName - The name of the blob
   * @param ttlSec - Time to live in seconds (default: 900 = 15 minutes)
   * @returns The signed URL with SAS token
   */
  private generateReadSasUrl(blobName: string, ttlSec: number = 900): string {
    if (!this.accountName || !this.accountKey) {
      throw new Error(
        'AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY are required for generating SAS URLs',
      );
    }

    const cred = new StorageSharedKeyCredential(
      this.accountName,
      this.accountKey,
    );
    const service = new BlobServiceClient(
      `https://${this.accountName}.blob.core.windows.net`,
      cred,
    );
    const containerClient = service.getContainerClient(this.containerName);

    const expiresOn = new Date(Date.now() + Math.max(60, ttlSec) * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      cred,
    ).toString();

    return `${containerClient.getBlockBlobClient(blobName).url}?${sas}`;
  }
}
