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
 * Document URLs are stored without a SAS signature. This adds a fresh
 * read-only one to every `url` field that points to our blob container, so all
 * endpoints that return documents serve working links.
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
          key === 'url' && typeof value[key] === 'string'
            ? this.blobService.signStoredUrl(value[key])
            : this.sign(value[key]);
      }
    }
    return value;
  }
}
