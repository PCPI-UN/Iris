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

  const doc = (url: string) => ({ id: 1, projectId: 5, type: 'POSTER', url });

  it('signs the url of project documents at any depth', async () => {
    const result = await run({
      items: [{ id: 1, documents: [doc('a'), doc('b')] }],
      document: doc('c'),
    });
    expect(result).toEqual({
      items: [{ id: 1, documents: [doc('a?signed'), doc('b?signed')] }],
      document: doc('c?signed'),
    });
  });

  it('leaves url fields that are not project documents alone', async () => {
    const payload = { link: { url: 'x' }, other: { projectId: 5, url: 'y' } };
    expect(await run(payload)).toEqual({
      link: { url: 'x' },
      other: { projectId: 5, url: 'y' },
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
