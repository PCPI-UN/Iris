import { Response } from 'express';
import { NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';
import { ProjectsController } from '../projects.controller';

const documents = [
  { id: 7, projectId: 3, url: '1-poster.png', type: 'POSTER' },
  {
    id: 8,
    projectId: 3,
    url: 'https://example.com/a.pdf',
    type: 'SUPPORTING_DOCUMENT',
  },
];

/** ProjectsService with only what getDocumentOpenUrl uses */
const buildService = () => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const grpc = {
    listProjectDocuments: jest.fn(() => of({ items: documents })),
  };
  const blob = {
    openUrl: jest.fn((value: string) =>
      value.startsWith('https://') ? null : `https://signed/${value}`,
    ),
  };
  Object.assign(service, {
    projectsService: grpc,
    azureBlobUploadService: blob,
  });
  return { service, grpc, blob };
};

describe('Open project document', () => {
  it('returns the signed URL of the document file', async () => {
    const { service, grpc } = buildService();
    await expect(service.getDocumentOpenUrl(3, 7)).resolves.toBe(
      'https://signed/1-poster.png',
    );
    expect(grpc.listProjectDocuments).toHaveBeenCalledWith({ projectId: 3 });
  });

  it('answers 404 for a document of another project or that does not exist', async () => {
    const { service } = buildService();
    await expect(service.getDocumentOpenUrl(3, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers 404 instead of redirecting to an external URL', async () => {
    const { service } = buildService();
    await expect(service.getDocumentOpenUrl(3, 8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('redirects with 302 and no caching', async () => {
    const { service } = buildService();
    const controller = new ProjectsController(service);
    const res = {
      set: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };
    await controller.openDocument(3, 7, res as unknown as Response);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://signed/1-poster.png',
    );
  });
});
