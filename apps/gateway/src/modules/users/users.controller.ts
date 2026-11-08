import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AppUser } from '../auth/types/app-user.type';

@ApiTags('users')
@ApiSecurity('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}


  @RequirePermission('create:users')
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing create:users permission' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only the principal admin creates administrators' })
  create(@Body() createUserDto: CreateUserDto, @GetUser() user: AppUser) {
    return this.usersService.create(createUserDto, user.id);
  }

  @RequirePermission('read:users')
  @Get()
  @ApiOperation({ summary: 'Get all users with optional filters' })
  @ApiResponse({ status: 200, description: 'Returns list of users' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing read:users permission' })
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @RequirePermission('read:users')
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiResponse({ status: 200, description: 'Returns user details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing read:users permission' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @RequirePermission('update:users')
  @Patch(':id')
  @ApiOperation({ summary: 'Update user details' })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing update:users permission' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only the principal admin edits administrators' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: AppUser,
  ) {
    return this.usersService.update(id, updateUserDto, user.id);
  }

  @RequirePermission('delete:users')
  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiParam({ name: 'id', description: 'User ID', type: Number })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing delete:users permission' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Own account, or an administrator without being the principal admin' })
  @ApiResponse({ status: 400, description: 'The last active Admin cannot be deactivated' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: AppUser) {
    return this.usersService.remove(id, user.id);
  }
}
