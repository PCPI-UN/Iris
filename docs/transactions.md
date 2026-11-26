# Writes that go together

When a use case makes several writes that must be saved together or not at all, it wraps them in `UnitOfWork.run`. The port lives in `libs/common/src/ports/unit-of-work.port.ts` and each service provides its own adapter, because each service has its own database and Prisma client.

## How it works

- `PrismaService.db` is the open transaction when the call runs inside one, and the default client otherwise. Repositories query through `db`, so they take the transaction without receiving it as a parameter.
- `PrismaService.transaction(work)` opens a transaction, or reuses the open one when it is called inside another. A repository method that needs its own transaction uses it, and inside `run` it joins the outer one.
- `PrismaUnitOfWork` implements the port with `PrismaService.transaction`. The module registers it with `{ provide: UnitOfWork, useClass: PrismaUnitOfWork }` and the use case injects `UnitOfWork`.

A service that does not have `PrismaService.db` and `PrismaUnitOfWork` yet adds them in the pull request of its first use case that needs writes from several repositories, copying them from `project-service`.

## Example

Changing the state of a project and recording it in the change log. If the change log insert fails, the state change is undone.

```ts
await this.uow.run(async () => {
  await this.projectRepo.setProjectState(id, 'REJECTED');
  const entry = buildProjectChangeLogEntry({ projectId: id, actorUserId, action, before, after, reason });
  if (entry) await this.changeLogRepo.create(entry);
});
```

## Rules inside `run`

- Await everything that is started: a promise left running fails once the transaction closes.
- Call other services before or after `run`, never inside: the transaction closes after Prisma's default 5 s.
- Do not catch a database error to continue: after it the transaction is aborted.

## What it does not cover

The transaction belongs to one database. A write in one service and a later call to another service that fails are not undone together: when project-service saves a project and the call to invitation-service fails afterwards, the project stays saved.
