import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Get,
  Query,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { Public } from '../../common/decorators/public.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AppUser } from '../auth/types/app-user.type';
import { AddPendingParticipantDto } from './dto/add-pending-participant.dto';
import { CreateProjectWithParticipantsDto } from './dto/create-project-with-participants.dto';
import { CreateProjectWithParticipantsMultipartDto } from './dto/create-project-with-participants-multipart.dto';
import { AssignJurorToProjectsDto } from './dto/assign-juror-to-projects.dto';
import { ReassignProjectJurorDto } from './dto/reassign-project-juror.dto';
import { RemoveJurorFromProjectDto } from './dto/remove-juror-from-project.dto';
import { RejectProjectDto } from './dto/reject-project.dto';
import { ListProjectsByEventDto } from './dto/list-projects-by-event.dto';
import {
  DocumentStatusFilter,
  UpdateProjectDocumentDto,
} from './dto/update-project-document.dto';
import { TypedDocument } from './dto/project-document-input.dto';
import { ListProjectsAssignedToJurorDto } from './dto/list-projects-assigned-to-juror.dto';
import { AddProjectDocumentsMultipartDto } from './dto/add-project-files-multipart.dto';
import { RequestChangesProjectDto } from './dto/request-changes-project.dto';
import { UpdateProjectInfoDto } from './dto/update-project-info.dto';
import { UpdateProjectCodeDto } from './dto/update-project-code.dto';
import { ApproveProjectDto } from './dto/approve-project.dto';
import { ProjectTutorsInputDto } from './dto/project-tutors-input.dto';
import { TutorCandidatesQueryDto } from './dto/tutor-candidates-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ProjectChangeLogResponseDto } from './dto/project-change-log-response.dto';
import { AdminChangeProjectStateDto } from './dto/admin-change-project-state.dto';
import { AdminUpdateProjectDto } from './dto/admin-update-project.dto';

@ApiTags('projects')
@ApiSecurity('JWT-auth')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Public()
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 4 }, // Max 4 files: 1 logo + 1 poster + 2 supporting docs
      ],
      {
        limits: {
          fileSize: 25 * 1024 * 1024, // 25MB max per file
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit a new project with file uploads',
    description:
      'Public endpoint that allows anyone to submit a project with participants and document files. ' +
      'Accepts up to 4 files: 1 logo, 1 poster, and 2 supporting documents. ' +
      'Maximum file size: 25MB per file. ' +
      'Files are uploaded to Azure Blob Storage. No authentication required. ' +
      'The optional `tutors` field takes the project tutors (see the body schema); they get the Tutor role ' +
      'and their invitations when the project is approved.',
  })
  @ApiBody({
    description: 'Project data with file uploads (max 4 files, 5MB each)',
    type: CreateProjectWithParticipantsMultipartDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Project submitted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data, file too large, or too many files',
  })
  @ApiResponse({
    status: 409,
    description:
      'One or more of the project participants already have an existing project in this event.',
  })
  @ApiResponse({
    status: 413,
    description: 'File size exceeds 5MB limit',
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to upload files to Azure Blob Storage',
  })
  async submitProject(
    @Body() body: CreateProjectWithParticipantsMultipartDto,
    @UploadedFiles() uploadedFiles: { files?: Express.Multer.File[] },
  ) {
    return this.projectsService.createProjectWithParticipantsAndFiles(
      body,
      uploadedFiles.files || [],
    );
  }

  @Post('add-update-participants')
  @ApiOperation({
    summary: 'Add a pending participant to a project or update an existing one',
    description:
      'Adds a new pending participant to a project or updates an existing pending participant if the email already exists for that project. ' +
      'Only a participant of the project or a user with manage:events.',
  })
  @ApiResponse({
    status: 201,
    description: 'Participant created/updated successfully',
  })
  async addPendingParticipant(
    @Body() body: AddPendingParticipantDto,
    @GetUser('id') userId: number,
  ) {
    await this.projectsService.assertProjectAccess(userId, 'EDIT', {
      projectId: body.projectId,
    });
    return this.projectsService.addPendingParticipant(body);
  }

  @Post('assign-jurors')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Assign a juror to multiple projects',
    description:
      'Assigns a single juror to multiple projects in bulk. Requires admin or event manager role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Juror assigned to projects successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires platform permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'User or projects not found',
  })
  assignJurorToProjects(@Body() assignJurorDto: AssignJurorToProjectsDto) {
    return this.projectsService.assignJurorToProjects(assignJurorDto);
  }

  @Patch('reassign-juror')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Reassign a project from one juror to another',
    description:
      'Transfers project evaluation responsibility from one juror to another. Requires admin or event manager role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Juror reassigned successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires platform permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Project or users not found',
  })
  reassignProjectJuror(@Body() reassignJurorDto: ReassignProjectJurorDto) {
    return this.projectsService.reassignProjectJuror(reassignJurorDto);
  }

  @Delete(':projectId/jurors/:jurorId')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Remove a juror from a project',
    description:
      'Removes a juror assignment after verifying the juror has not evaluated the project yet.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 1 })
  @ApiParam({ name: 'jurorId', description: 'Juror User ID', example: 5 })
  @ApiResponse({ status: 200, description: 'Juror removed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Juror has already evaluated this project',
  })
  @ApiResponse({
    status: 404,
    description: 'Project or juror assignment not found',
  })
  removeJurorFromProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('jurorId', ParseIntPipe) jurorId: number,
  ) {
    const dto: RemoveJurorFromProjectDto = {
      projectId,
      jurorUserId: jurorId,
    };

    return this.projectsService.removeJurorFromProject(dto);
  }

  @Patch(':id/approve')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Approve a project',
    description:
      'Marks a project as approved. Requires admin or event manager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project approved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires platform permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  approveProject(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: AppUser,
    @Body() approveDto: ApproveProjectDto,
  ) {
    return this.projectsService.approveProject({ id, ...approveDto }, user.id);
  }

  @Patch(':id/reject')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Reject a project',
    description:
      'Marks a project as rejected with an optional reason. Requires admin or event manager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project rejected successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires platform permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  rejectProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() rejectDto: RejectProjectDto,
    @GetUser() user: AppUser,
  ) {
    return this.projectsService.rejectProject({ id, ...rejectDto }, user.id);
  }

  @Patch(':id/request-changes')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Request changes of a project',
    description:
      'Marks a project as request changes with a mandatory reason. Requires admin or event manager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Required changes successfully requested for the project',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires platform permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  requestChangesProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() requestChangesDto: RequestChangesProjectDto,
    @GetUser() user: AppUser,
  ) {
    return this.projectsService.requestChangesProject(
      { id, ...requestChangesDto },
      user.id,
    );
  }

  @Post(':id/change-to-under-review')
  @ApiOperation({
    summary: 'Change project state to under review',
    description:
      'Changes the state of a project from "request changes" to "under review". Requires the user to be a participant of the project.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project state changed to under review successfully',
  })
  async changeToUnderReviewProject(
    @Param('id', ParseIntPipe) projectId: number,
    @GetUser() user: AppUser,
  ) {
    return this.projectsService.changeToUnderReviewProject(projectId, user.id);
  }

  @Public()
  @Get('by-event/:eventId')
  @ApiOperation({
    summary: 'List projects by event',
    description:
      'Returns paginated projects for a given event, with optional filters by course, search text, and state.',
  })
  @ApiParam({
    name: 'eventId',
    type: Number,
    description: 'ID of the event to filter projects',
    example: 1,
  })
  async listProjectsByEvent(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: ListProjectsByEventDto,
  ) {
    const res = await this.projectsService.listProjectsByEvent(eventId, query);

    return {
      items: res.items,
      total: res.total,
      currentPage: res.currentPage,
      itemsOnCurrentPage: res.itemsOnCurrentPage,
      itemsPerPage: res.itemsPerPage,
      totalPages: res.totalPages,
    };
  }

  @Public()
  @Get('by-event/:eventId/with-jurors')
  @ApiOperation({
    summary: 'List projects by event with their assigned jurors',
    description:
      'Returns paginated projects for a given event and includes the jurors assigned to each project.',
  })
  @ApiParam({
    name: 'eventId',
    type: Number,
    description: 'ID of the event to filter projects',
    example: 1,
  })
  async listProjectsByEventWithJurors(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: ListProjectsByEventDto,
  ) {
    return this.projectsService.listProjectsByEventWithJurors(eventId, query);
  }

  @Get('assigned-projects')
  @ApiOperation({
    summary: 'List projects assigned to a juror',
    description:
      'Returns paginated projects assigned to a specific juror within an event.',
  })
  async listAssignedProjects(
    @Query() query: ListProjectsAssignedToJurorDto,
    @GetUser('id') jurorId: number,
  ) {
    const { eventId, page, pageSize } = query;

    return this.projectsService.listAssignedProjectsByJuror(
      Number(jurorId),
      Number(eventId),
      Number(page ?? 1),
      Number(pageSize ?? 20),
    );
  }

  @Public()
  @Get('tutor-candidates')
  @ApiOperation({
    summary: 'Search users who can be the tutor of a project',
    description:
      'Active users with the Tutor or Professor role; every word of `search` must appear in the first ' +
      'or last name (at least 3 letters). Returns at most 10 results with id and name, no email. ' +
      'Public, like the submission form that uses it.',
  })
  @ApiResponse({ status: 400, description: '`search` has fewer than 3 letters' })
  async searchTutorCandidates(@Query() query: TutorCandidatesQueryDto) {
    return this.projectsService.searchTutorCandidates(query.search);
  }

  @RequirePermission('manage:events')
  @Put(':id/tutors')
  @ApiOperation({
    summary: 'Replace the tutors of a project',
    description:
      'Replaces the whole list. Tutors left out are unlinked (they keep their roles). On an approved ' +
      'project, linked tutors get the Tutor role and new tutors typed in by email are invited; ' +
      'otherwise that happens when the project is approved. Returns the resulting tutors.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID', example: 1 })
  async setProjectTutors(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ProjectTutorsInputDto,
  ) {
    return this.projectsService.setProjectTutors(id, body);
  }

  @Get(':id/for-review')
  @ApiOperation({
    summary: 'Get project details for review',
    description:
      'Returns detailed information of a project for review purposes, including participants and documents. ' +
      'This endpoint is intended for jurors to review assigned projects.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Project ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project details for review retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async getProjectForReview(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ) {
    await this.projectsService.assertProjectAccess(userId, 'READ', {
      projectId: id,
    });
    return this.projectsService.getProjectForReview(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get project by id',
    description:
      'Returns a single project for the given id. Only its participants, its assigned jurors and users with read:events.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Project identifier',
    example: 1,
  })
  async getProject(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ) {
    await this.projectsService.assertProjectAccess(userId, 'READ', {
      projectId: id,
    });
    return this.projectsService.getProjectById(id);
  }

  @Patch('documents/:id')
  @ApiOperation({
    summary: 'Update project document',
    description:
      'Update the document file, type, or state of a project document. ' +
      'Only a participant of the project or a user with manage:events; checked before the file is uploaded.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project Document ID',
    example: 1,
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'New document file (optional)',
        },
        type: {
          type: 'string',
          enum: Object.values(TypedDocument),
          description: 'New document type (optional)',
        },
        state: {
          type: 'string',
          enum: Object.values(DocumentStatusFilter),
          description: 'Document state (optional)',
        },
      },
    },
  })
  async updateDocument(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UpdateProjectDocumentDto,
    @GetUser('id') userId: number,
  ) {
    await this.projectsService.assertProjectAccess(userId, 'EDIT', {
      documentId: id,
    });
    const updated = await this.projectsService.updateProjectDocument(
      id,
      body,
      file,
    );
    return updated;
  }

  @Patch(':id/info')
  @ApiOperation({
    summary: 'Update project information',
    description:
      'Updates the name and/or description of a project. Only a participant of the project or a user with manage:events.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiBody({
    description: 'Project information to update',
    type: UpdateProjectInfoDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Project information updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async updateProjectInfo(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProjectInfoDto: UpdateProjectInfoDto,
    @GetUser('id') userId: number,
  ) {
    await this.projectsService.assertProjectAccess(userId, 'EDIT', {
      projectId: id,
    });
    return this.projectsService.updateProjectInfo(
      id,
      updateProjectInfoDto.name,
      updateProjectInfoDto.description,
    );
  }

  @Patch(':id/code')
  @ApiOperation({
    summary: 'Update project code',
    description:
      'Updates the project code. Only allowed when the project is in REQUEST_CHANGES state and the user is a participant of the project.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiBody({
    description: 'Project code to update',
    type: UpdateProjectCodeDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Código del proyecto actualizado correctamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or project is not in REQUEST_CHANGES state',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User is not a participant of the project',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async updateProjectCode(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProjectCodeDto: UpdateProjectCodeDto,
    @GetUser() user: AppUser,
  ) {
    await this.projectsService.updateProjectCode(
      id,
      updateProjectCodeDto.projectCode,
      user.id,
    );
    return { message: 'Código del proyecto actualizado correctamente' };
  }

  @RequirePermission('manage:projects')
  @Get(':id/change-log')
  @ApiOperation({
    summary: 'List the administrative changes of a project',
    description:
      'Corrections made by administrators (state, data, category, participants, tutors, documents), ' +
      'most recent first: action, author, date, changed fields before and after, and reason.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID', example: 1 })
  @ApiResponse({ status: 200, type: ProjectChangeLogResponseDto })
  @ApiResponse({ status: 403, description: 'The user lacks manage:projects' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async listProjectChangeLog(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectChangeLogResponseDto> {
    return this.projectsService.listProjectChangeLog(id);
  }

  @RequirePermission('manage:projects')
  @Patch(':id/admin/state')
  @ApiOperation({
    summary: 'Change the state of a project (administrative correction)',
    description:
      'Moves the project from any state to any other with a mandatory reason, and records the change ' +
      'in the change log. Becoming APPROVED has the effects of the normal approval (Tutor role and ' +
      'invitations for the tutors). With notify the pending participants get the email of the new state ' +
      '(none for UNDER_REVIEW). If the project has juror evaluations or the event has published results, ' +
      'nothing changes and the answer is 409 with code PROJECT_STATE_CHANGE_BLOCKED and the cause in ' +
      'details (hasEvaluations, evaluationCount, resultsPublished, leavesApproved); resend with force to apply it. ' +
      'Leaving APPROVED takes the project out of the ranking and the juror import; evaluations are kept. ' +
      'The project reason is set for REJECTED and REQUEST_CHANGES and cleared for the other states. ' +
      'A 409 without code means another change was saved first: reload and retry.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID', example: 1 })
  @ApiResponse({
    status: 200,
    description:
      'State changed; returns { project, failedEffects, warning }. failedEffects lists what failed after the ' +
      'change was saved (TUTOR_ACTIVATION, NOTIFICATION) and warning explains it in Spanish (null when nothing failed).',
  })
  @ApiResponse({
    status: 400,
    description:
      'Missing reason, unknown state or the project is already in that state',
  })
  @ApiResponse({ status: 403, description: 'The user lacks manage:projects' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({
    status: 409,
    description:
      'Not changed: the project has evaluations or the event has published results (send force: true)',
    schema: {
      example: {
        statusCode: 409,
        message:
          'No se cambió el estado porque el proyecto ya tiene 2 evaluaciones de jurados. Si el proyecto deja de estar aprobado, sale del ranking y de la plantilla e importación de jurados; sus evaluaciones se conservan. Confirma el cambio para aplicarlo de todas formas.',
        code: 'PROJECT_STATE_CHANGE_BLOCKED',
        details: {
          hasEvaluations: true,
          evaluationCount: 2,
          resultsPublished: false,
          leavesApproved: true,
        },
        timestamp: '2026-11-21T15:00:00.000Z',
      },
    },
  })
  adminChangeProjectState(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminChangeProjectStateDto,
    @GetUser() user: AppUser,
  ) {
    return this.projectsService.adminChangeProjectState(id, dto, user.id);
  }

  @RequirePermission('manage:projects')
  @Patch(':id/admin')
  @ApiOperation({
    summary:
      'Edit the basic data and the category of a project (administrative correction)',
    description:
      'Changes only the fields sent: name, description, projectCode, eventNumber and courseId (category); ' +
      'null or an empty text clears description, projectCode and eventNumber. The state is not editable here ' +
      '(PATCH /projects/:id/admin/state); a state field in the body is ignored. The changed fields are recorded ' +
      'in the change log with their values before and after (INFO for the basic data, CATEGORY for courseId) ' +
      'and the optional reason; an edit that changes nothing records nothing. The category must be an active ' +
      "category of the project's event (400 otherwise). A 409 changes nothing and its code says why: " +
      'PROJECT_NAME_TAKEN (another project of the event has the name; details.name) or ' +
      'PROJECT_CATEGORY_CHANGE_BLOCKED (the project has juror evaluations, scored with the rubrics of its ' +
      'category; details.evaluationCount; resend with force: true to change the category anyway) or ' +
      'PROJECT_CHANGED_MEANWHILE (another edit changed the same fields first; reload and retry).',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Project ID', example: 1 })
  @ApiResponse({ status: 200, description: 'The project with its new values' })
  @ApiResponse({
    status: 400,
    description:
      'No editable field, an invalid value, or a category that is not an active category of the event',
  })
  @ApiResponse({ status: 403, description: 'The user lacks manage:projects' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({
    status: 409,
    description:
      'Not changed: the name is taken in the event, the category change needs force because the project has evaluations, or another edit changed the same fields first',
    schema: {
      example: {
        statusCode: 409,
        message:
          'No se cambió la categoría porque el proyecto ya tiene 2 evaluaciones de jurados, calificadas con las rúbricas de la categoría actual. Confirma el cambio para aplicarlo de todas formas.',
        code: 'PROJECT_CATEGORY_CHANGE_BLOCKED',
        details: { evaluationCount: 2 },
        timestamp: '2026-11-21T15:00:00.000Z',
      },
    },
  })
  adminUpdateProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminUpdateProjectDto,
    @GetUser() user: AppUser,
  ) {
    return this.projectsService.adminUpdateProject(id, dto, user.id);
  }

  @Get(':id/jurors')
  @RequirePermission('read:event-members')
  @ApiOperation({
    summary: 'List jurors assigned to a project',
    description:
      'Returns the list of jurors (JurorKey) currently assigned to the given project.',
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'List of jurors assigned to the project',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async listProjectJurors(@Param('id', ParseIntPipe) id: number) {
    const jurors = await this.projectsService.listJurorsByProjectId(id);
    return { jurors };
  }

  @Public()
  @Get(':projectId/documents/:documentId/open')
  @ApiOperation({
    summary: 'Open a project document',
    description:
      'Stable link to a document: redirects (302) to a freshly signed read URL of its file (valid for 1 hour). ' +
      'Use it wherever a link must keep working after the response that listed it (exported reports, open tabs). ' +
      'Only files stored in the platform storage are served; anything else answers 404.',
  })
  @ApiParam({ name: 'projectId', type: Number, example: 1 })
  @ApiParam({ name: 'documentId', type: Number, example: 1 })
  async openDocument(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() res: Response,
  ) {
    const url = await this.projectsService.getDocumentOpenUrl(
      projectId,
      documentId,
    );
    // Each click signs a new URL: never let a cache keep the redirect
    res.set('Cache-Control', 'no-store').redirect(HttpStatus.FOUND, url);
  }

  @Public()
  @Post(':projectId/documents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 4 }, // mismo límite que el otro endpoint
      ],
      {
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB por file
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Add documents/files to an existing project',
    description:
      'Public endpoint to add document files to an existing project. ' +
      'Accepts up to 4 files per request: 1 logo, 1 poster, and 2 supporting documents. ' +
      'Maximum file size: 5MB per file. Files are uploaded to Azure Blob Storage.',
  })
  @ApiBody({
    description:
      'Document metadata with file uploads (max 4 files, 5MB each). ' +
      'The "documents" field must be a JSON array matching the number of files.',
    type: AddProjectDocumentsMultipartDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Files added to project successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data, file too large, or too many files',
  })
  @ApiResponse({
    status: 413,
    description: 'File size exceeds 5MB limit',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async addProjectDocuments(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: AddProjectDocumentsMultipartDto,
    @UploadedFiles() uploadedFiles: { files?: Express.Multer.File[] },
  ) {
    return this.projectsService.addFilesToExistingProject(
      projectId,
      body,
      uploadedFiles.files || [],
    );
  }
}
