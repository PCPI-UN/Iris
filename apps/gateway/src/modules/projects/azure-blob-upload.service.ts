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



export interface AzureBlobUploadResponse {
  blobName: string;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
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

    this.accountName = this.configService.get<string>('AZURE_ACCOUNT_NAME') || '';
    this.accountKey = this.configService.get<string>('AZURE_ACCOUNT_KEY') || '';
    this.containerName = this.configService.get<string>('AZURE_CONTAINER', '');

    try {
      const blobServiceClient = new BlobServiceClient(sasUrl);

      // Esto revienta si el SAS no tiene contenedor
      const containerClient = blobServiceClient.getContainerClient('');

      this.containerClient = containerClient;

    } catch (err) {
      this.logger.error('Error al inicializar AzureBlobUploadService:', err.message);
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

      // Generate a long-lived SAS URL (1 year)
      const url = await this.generateReadSasUrl(blobName, 31536000);

      this.logger.log(
        `File uploaded successfully: ${file.originalname} -> ${blobName}`,
      );

      return {
        blobName,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url,
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
   * Generates a SAS URL for reading a blob
   * @param blobName - The name of the blob
   * @param ttlSec - Time to live in seconds (default: 900 = 15 minutes)
   * @returns The signed URL with SAS token
   */
  private async generateReadSasUrl(
    blobName: string,
    ttlSec: number = 900,
  ): Promise<string> {
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



    const signedUrl = `${containerClient.getBlockBlobClient(blobName).url}?${sas}`;
    return signedUrl;
  }
}
