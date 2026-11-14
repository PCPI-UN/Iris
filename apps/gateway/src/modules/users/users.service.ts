import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AuthServiceClient,
  AUTH_SERVICE_NAME,
} from '@app/common/generated/auth';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private authService: AuthServiceClient;

  constructor(@Inject(AUTH_SERVICE_NAME) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.authService =
      this.client.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
  }

  create(createUserDto: CreateUserDto, actorUserId: number) {
    return firstValueFrom(
      this.authService.createPlatformUser({ ...createUserDto, actorUserId }),
    );
  }

  findAll(query: FindUsersQueryDto) {
    return firstValueFrom(this.authService.getUsers(query));
  }

  findOne(id: number) {
    return firstValueFrom(this.authService.getUser({ id }));
  }

  update(id: number, updateUserDto: UpdateUserDto, actorUserId: number) {
    return firstValueFrom(
      this.authService.updateUser({ id, ...updateUserDto, actorUserId }),
    );
  }

  findRoles() {
    return firstValueFrom(this.authService.getRoles({}));
  }

  setRoles(id: number, roleIds: number[], actorUserId: number) {
    return firstValueFrom(
      this.authService.setUserPlatformRoles({ userId: id, roleIds, actorUserId }),
    );
  }

  remove(id: number, actorUserId: number) {
    return firstValueFrom(
      this.authService.deactivateUser({ id, actorUserId }),
    );
  }
}
