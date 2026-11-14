import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AzureBlobUploadService } from './azure-blob-upload.service';

/**
 * Documents are stored with the name of their blob, not a URL. This turns the
 * stored value of every project document in a response into a working link
 * (current storage account + fresh read-only SAS), so all endpoints that
 * return documents serve usable URLs.
 */
@Injectable()
export class SignBlobUrlsInterceptor implements NestInterceptor {
  constructor(private readonly blobService: AzureBlobUploadService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.sign(data)));
  }

  private sign(value: any): any {
    if (Array.isArray(value)) {
      value.forEach((item, i) => (value[i] = this.sign(item)));
    } else if (value && Object.getPrototypeOf(value) === Object.prototype) {
      for (const key of Object.keys(value)) {
        value[key] =
          key === 'url' && this.isProjectDocument(value)
            ? this.blobService.signStoredUrl(value[key])
            : this.sign(value[key]);
      }
    }
    return value;
  }

  /** Shape of the `ProjectDocument` message, the only `url` that is a blob */
  private isProjectDocument(value: Record<string, any>): boolean {
    return (
      typeof value.url === 'string' &&
      typeof value.projectId === 'number' &&
      'type' in value
    );
  }
}
