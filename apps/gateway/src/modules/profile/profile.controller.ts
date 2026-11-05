import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { InvalidateCache } from '../../common/cache/invalidate-cache.decorator';
import { AppUser } from '../auth/types/app-user.type';
import { ForbidUnknownFields } from '../../common/guards/forbid-unknown-fields.guard';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { ProfileService } from './profile.service';

/**
 * The profile always belongs to the authenticated user: the user id comes from
 * the session, never from the URL or the body, so nobody can edit another profile.
 */
@ApiTags('profile')
@ApiSecurity('JWT-auth')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get my profile',
    description:
      'Returns the user data, the academic data derived from the user project participations, and the 10 most recent of those projects.',
  })
  @ApiResponse({ status: 200, description: 'Profile of the authenticated user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyProfile(@GetUser() user: AppUser) {
    return this.profileService.getProfile(user);
  }

  @Patch('me')
  @UseGuards(ForbidUnknownFields(UpdateOwnProfileDto))
  @InvalidateCache({ currentUser: true, endpoints: ['/users'] })
  @ApiOperation({
    summary: 'Edit my profile',
    description:
      'Only firstName, lastName and phone can be edited. Any other field (email, password, status, roles, academic data) returns 400.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 400, description: 'Invalid value or field that cannot be edited' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Phone already used by another user' })
  updateMyProfile(@GetUser() user: AppUser, @Body() dto: UpdateOwnProfileDto) {
    return this.profileService.updateProfile(user, dto);
  }
}
