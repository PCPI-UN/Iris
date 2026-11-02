import { CallHandler } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AzureBlobUploadService } from '../azure-blob-upload.service';
import { SignBlobUrlsInterceptor } from '../sign-blob-urls.interceptor';

describe('SignBlobUrlsInterceptor', () => {
  const blobService = {
    signStoredUrl: jest.fn((url: string) => `${url}?signed`),
  } as unknown as AzureBlobUploadService;
  const interceptor = new SignBlobUrlsInterceptor(blobService);

  const run = (data: unknown) =>
    lastValueFrom(
      interceptor.intercept(
        {} as any,
        { handle: () => of(data) } as CallHandler,
      ),
    );

  it('signs url fields at any depth, in objects and arrays', async () => {
    const result = await run({
      items: [{ id: 1, documents: [{ url: 'a' }, { url: 'b' }] }],
      project: { documents: [{ url: 'c' }] },
    });
    expect(result).toEqual({
      items: [{ id: 1, documents: [{ url: 'a?signed' }, { url: 'b?signed' }] }],
      project: { documents: [{ url: 'c?signed' }] },
    });
  });

  it('leaves other fields, dates and primitives alone', async () => {
    const date = new Date();
    expect(await run({ galeryUrl: 'x', createdAt: date })).toEqual({
      galeryUrl: 'x',
      createdAt: date,
    });
    expect(await run('text')).toBe('text');
    expect(await run(null)).toBeNull();
  });
});
