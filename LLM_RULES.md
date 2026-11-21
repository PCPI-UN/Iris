# Project Context & Rules

Hello! In this file, I'm explaining the rules of how is structured my codebase and the conventions we follow for each service. 

## Structure of the services

The entrypoint for the clients in my system is an API gateway. This API Gateway is responsible for routing and enrich the responses
from microservices. They gateway also handles the platform authentication. In the gateway there's no business logic, all of that is
handled at the service level. When adding a new feature to a service, two steps are required:
1. Implement the feature in the service
2. Expose that feature in the API Gateway

We first test if everything works correctly in the service. Once we know is working, we go and implement the changes in the API Gateway.
These changes can be creating the endpoint in the controller and enriching the response with the data from other services, for example. 

All our services have this same structure - although some of them does not follow these rules at all right now -. Please understand the
structure and make sure that you follow it.

We are following Clean Architecture Principles. The structure of folders is something like:
```
    service_folder/
        prisma/
            schema.prisma
        src/
            common/
               prisma/ <- This stores prisma.module and prisma.service so it's available for all modules
            modules/
                module_1/
                    application/
                        dto/
                        mappers/ <- Map use-cases responses to what is specified in the `.proto` contract
                        ports/ <- For those ports that are business logic. `ports` in infrastructure are external services!
                        use-cases/
                    domain/
                        entities/
                        repositories/
                    infrastructure/
                        ports/ <- You can have a port for gRPC clientes here
                        adapters/ <- And implement them here
                    interface/
                        grpc/
                            module_1.controller.ts <- The controller uses the mapper under `/application`  since it uses the use-case
                    module_1.module.ts <- Here we can have the client registration of gRPC clients
                module_2/
            name-service.module.ts <- Imports all the modules and registers the `.env` file if provided!
            main.ts <- Bootstrap and other application configuration
        .env 
        docker-compose.yml
        Dockerfile
        tsconfig.app.json
```
2. The controller calls a use-case and then calls the mapper. The mapper - which is usually under `/application/mapper` - is 
responsible for mapping the response from the use-case to match the generated type from ts-proto. This ensures that
the controller is thin and that what is specified in the `.proto` contract is what's being returned

3. Under `/application/dto` we are using `class-validator`. The controller uses the pattern `request: MyDto`
to benefit from the `class-validator` decorators. To map the `HttpException` errors throw by `class-validator`
a modified `ValidationPipe` is used:
```typescript
main.ts
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = errors.map((error) => {
          const constraints = error.constraints;
          if (constraints) {
            return `${error.property}: ${Object.values(constraints).join(', ')}`;
          }
          return `${error.property}: validation failed`;
        });
  
        return new RpcException({
          code: 3, // Equivalent to HTTP 400 Bad Request
          message: `Validation failed: ${messages.join('; ')}`,
        });
      },
    }));
```
As you can see, the pipe maps the `class-validator` errors back to `RpcException` errors that 
can be transmitted to other microservices.

4. Use-cases only use abstractions (`ports`) so they don't depend on a specific adapter or 
implementation. 

5. Each service has it's own `schema.prisma`

6. Each service has a `.proto` file under `libs/common/src/protos`

7. For `get` methods that support pagination, the response should look like:
```protobuf
message PaginationMetadata {
  int32 total = 1;
  int32 itemsOnCurrentPage = 2;
  int32 itemsPerPage = 3;
  int32 currentPage = 4;
  int32 totalPages = 5;
}

message EntityProto {
}

message ListEntityResponse {
  repeated EntityProto entities = 1;
  PaginationMetadata meta = 2;
}
```
This is consistent and follows the best practices. We are not using 
cursor-based pagination for now, but page-based pagination with `page`
and `limit`

8. For each endpoint, there's a use-case except if we can re-use one 

9. We use class-based dependency injection. We declare ports as abstract classes
that can be injected directly in the constructors of use-cases

10. For entities under `/domain/entities` we always use classes

11. We are not returning observables in the gRPC ports. Instead, we are always returning 
a promise

12. For registering a client in a service, you can use the generated types 
from ts-proto. Here's an example:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import {
  CRITERIONS_SERVICE_NAME,
  protobufPackage,
} from '@app/common/generated/evaluation';
import { CriterionsService } from './criterions.service';
import { CriterionsController } from './criterions.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: CRITERIONS_SERVICE_NAME,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: protobufPackage,
            protoPath: join(
              process.cwd(),
              'libs/common/src/protos/evaluation.proto',
            ),
            url: configService.get<string>('EVALUATION_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [CriterionsController],
  providers: [CriterionsService],
  exports: [CriterionsService],
})
export class CriterionsModule {}
```
13. We have path aliases defined under `service_folder/tsconfig.app.json`. Always use them if you need to use '../', './' is acceptable

14. When calling a gRPC service, you must always create a `port` for the service (e.g. `EventServicePort`) and create
an adapter that implement the port's methods. Then you can inject the servive port in the use-case. That's the standard and correct 
way to do it. If the service will be used in a single module of the service, the port and adapter can be under the `infrastructure` folder
of the service. Remember that `infrastructure` must have the `ports` and `adapters` folders for organization purposes. 

15. When a use case makes several writes that must be saved together or not at all (for example an edit and its change log entry),
it wraps them in `UnitOfWork.run` (port in `libs/common/src/ports`). Repositories do not open their own `$transaction` for writes
that belong to different repositories. Read `docs/transactions.md` before using it: it explains the rules inside `run` and
how to add the adapter to a service that does not have it yet.

## Services in the application

We have 7 services: 

- `auth-service`: responsible for auth, users, roles and permissions
- `evaluation-service`: responsible for the management of criterions and evaluations! More information within the schema @schema.prisma 
- `event-service`: responsible for courses and events @schema.prisma 
- `gateway`: the entrypoint for the clients
- `invitation-service`: responsible for creating invitations. Here is where the onboarding process for new users happen! @schema.prisma 
- `notification-service`: responsible for sending emails
- `project-service`: responsible for the management of projects

## User onboarding

With this in mind, now you need to know how we manage users in our platform. Let's start with the minimum concept: roles. We have platform roles and event roles. A `platform` role is a role whose scope is the complete system. Right now, there are three: `Admin`, `EventManager` and `User`. Currently, we are only using `Admin` and `User`. Hopefully, it's clear for you that the `Admin` is a user with all the privileges over the system and a `User` is just an authenticated entity. Now, what are these event roles? Well, we have `Juror` and `Participant`. A `Juror` is a user that was invited to an event and got a set of projects assigned, these projects will be evaluated by them. A `Participant` is a user that submitted a project to an event and is waiting for evaluation.

So, a user can be a `Juror` in Event #1 and a `Participant` in Event #2. But how is this onboarding process? Let's start with participants. By default, you do not have an account in the system and you can't create one manually. Initially, what you do is submitting a project an event that has registration opened. Once you submit a project:

1. You receive a notification email saying 'Hey we received your project! Is Under review'
2. Once an admin reviews your project and it's approved, you receive an email saying 'Your project was approved for this event! Here is the invitation link where you can create your account'. 
3. You open the link. There, there are two options: set a password or sign-in with Microsoft

This is the onboarding process for a participant. However, you might be wondering which are the services that are handling these steps. Well, let me explain you:

1. Frontend -> Gateway -> Project-service -> Notification-service
2. Frontend -> Gateway -> Project-service (creates an invitation for each project participant @approve-project.uc.ts )-> Invitation-service @create-invitation.use-case.ts -> Notificiation-service
3. Frontend -> Gateway -> Invitation-service @accept-invitation.use-case.ts -> Based on the type of invitation it can call the Event, User and Project services 

And that's it! For Jurors, the onboarding is pretty straightforward. The frontend calls the method for inviting a juror to an event at @invitations.service.ts @invitations.controller.ts . The invitation service creates the invitation, the juror receives the invitation and it can go to the link to setup their account.  Something similar occurs with adminsm altought we are not supporting that in the gateway for now I think.


# Running the code
1. A `.env` file is expected at the root of the project. You can copy the `.env.example` file and rename it to `.env`.
2. Once you have the `.env`, you can execute make targets. You can run `make help` to see the available targets. 
3. If you want to run the code in development mode (with hot reload!) you can run `make dev-build` and then
`make dev-up`. The docker-compose file that is triggered is `docker-compose.dev.yml`.
4. If you want to run the code in production moe, you can run `make prod-build` and then `make prod-up`. The idea
of these targets is execute the `docker-compose.prod.yml` file and allow you to run the code in a production environment,
similar to the one that is deployed. If your code works this way, it should work in production.

NOTE: If you ran the code in `development` mode and then you want to run it in `production`, you should
run `make clean-all` to clean cache, volumes and anything that can be left from the previous mode.

# Important
1. DO NOT ASSUME ANYTHING. Before any change, ask clarification questions if the request was not clear
2. Before doing any change to the code, evaluate if what is proposed follows the project conventions. If not, 
let the user know it and quote the part in the project conventions that is against the rule. The samme applies
for you, before any change you must check if it follows the project conventions and code style
3. Do not perform a lot of tasks at the same time, execute them one by one and let the user know once you 
are done with each task. Always request a review of the code after each task. 
4. Once the features are working in `development` mode, remember the user that the features must be tested 
in `production` mode as well. 
5. If the service does not follow the practices at all - it's a mess - then you should let the user know that
is not following the project conventions. You SHOULD NOT propose any changes to the codebase, just adapt to what is 
there so far. It's a technical debt. 