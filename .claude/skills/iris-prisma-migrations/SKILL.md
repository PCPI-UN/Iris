---
name: iris-prisma-migrations
description: "Guided workflow for changing a Prisma schema in the Iris backend: creates a reviewable SQL migration for the right service and updates docs/<service>/schema.md in the same step. Use this skill whenever a developer edits or wants to edit any apps/<service>/prisma/schema.prisma, or says things like 'add a column', 'new table', 'new model', 'change this field type', 'make this nullable', 'rename this column', 'create a migration', 'prisma migrate', 'update schema.md' or 'sync the ER diagram'. Also trigger when a diff touches schema.prisma or a migrations/ folder. Instructions only: no scripts, works in Windows PowerShell, needs no database by default. Even if the change looks trivial, use this skill so the migration and the docs stay in sync."
---

# Iris Prisma Migrations

You help a developer change the database schema of one Iris microservice safely: a reviewable migration, an up-to-date `docs/<service>/schema.md`, and a clean commit. You are a careful teammate, not a generator: you read the SQL, say what is risky, and ask before anything irreversible or outward-facing.

This skill is **instructions only**. Never create scripts, never add npm dependencies, never regenerate `schema.md` with a tool: you edit the markdown by hand.

## Before You Start

1. **Read `LLM_RULES.md`** at the repo root. Its rules win over this skill. Key ones here: each service owns its `schema.prisma` (rule 5), do not assume anything, do one task at a time and ask for review after each, and anything that works in development must also be tested in production mode.
2. **Identify the service.** Prisma schemas live in `apps/<service>/prisma/schema.prisma`; take the service from the path of the changed file (`git status`). Do not rely on a fixed list of services: new ones follow the same layout. If the changed schema is somewhere else, or the service has no `migrations/` folder yet, stop and ask (a first migration for a new service needs an initial baseline, which is a different conversation).
3. **Confirm the taskId** (ClickUp, e.g. `CU-86abcdefg`). Never invent it. It is needed for the branch and the commit.
4. **Check the branch.** Work on a branch created from `origin/dev`, named `<taskId>/<Short-Description>`. Never commit on the branch of an open PR that is not yours to change.
5. **Know the two environments** and tell the developer once, briefly:
   - Production applies migrations with `prisma migrate deploy` (only what is in `migrations/`).
   - The dev stack uses `prisma db push --accept-data-loss`, which ignores `migrations/`. **The dev database can differ from `migrations/`. Never assume it is up to date, and never use it to decide what the migration should contain.**

## Hard Rules

- Do not run anything against any database unless the developer explicitly asks. This includes `migrate dev`, `migrate deploy`, `migrate reset`, `migrate resolve` and `db push`. Never touch the shared dev database.
- Never run `make clean` (it deletes the dev database).
- Never edit or delete an existing migration folder. A migration that is already in `dev` or `prod` is history; fix mistakes with a new migration.
- No `git push`, no PR, no ClickUp changes unless the developer asks. Before opening a PR, show the title and description and wait for approval of the text.
- Do not add anything to `package.json` or the lockfile.
- Commands must work in PowerShell: no `&&`, no `$VAR` bash syntax, no `export`. Use `;` or separate commands, forward slashes in paths, and `$env:NAME` for variables.

## Workflow

Do the steps in order, one at a time. After each step, say what you did and wait for the developer when a confirmation is marked.

### Step 1: Understand the change

Read the diff of `schema.prisma` (`git diff -- apps/<service>/prisma/schema.prisma`). Describe back, in a few lines, what changes: new/removed models, columns, enums, relations, constraints, types, nullability, defaults. Ask if anything is ambiguous, especially:

- **Renames.** Prisma cannot tell a rename from drop + add. If a column or table was renamed, ask. A rename must keep the data: the SQL needs `ALTER ... RENAME` written by hand (see Step 3).
- **New required columns on a table that may already have rows.** Ask for the default or backfill.

### Step 2: Generate the SQL migration (offline by default)

This needs no database and no `DATABASE_URL`.

1. Make sure the baseline is right. The "old" schema is the committed one (`HEAD`). If the branch already contains schema changes that have no migration yet, ask which commit or ref is the baseline instead of `HEAD`.
2. Save the old schema to a temporary file **outside the repo**. Use `cmd` for the redirect so the bytes are not re-encoded (PowerShell 5 would write UTF-16):

   ```powershell
   cmd /c "git show HEAD:apps/<service>/prisma/schema.prisma > %TEMP%\old-<service>.prisma"
   ```

3. Diff old against the working copy:

   ```powershell
   pnpm exec prisma migrate diff --from-schema-datamodel $env:TEMP/old-<service>.prisma --to-schema-datamodel apps/<service>/prisma/schema.prisma --script
   ```

   If the output is empty there is nothing to migrate: say so and stop. The `warn ... package.json#prisma is deprecated` lines are harmless.
4. Name the migration `snake_case`, describing the change (`add_nickname_to_users`). The folder is `apps/<service>/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`, timestamp in UTC, later than the newest existing folder. Create it with the file-writing tool, **UTF-8 without BOM**, SQL exactly as printed.
5. Delete the temporary file.

**Optional, only if the developer has their own disposable local Postgres** (never the shared dev database): `pnpm exec prisma migrate dev --create-only --name <name> --schema=apps/<service>/prisma/schema.prisma` with `$env:DATABASE_URL` pointing to it. With such a database you can also check drift (an empty result means `migrations/` matches the schema): `pnpm exec prisma migrate diff --from-migrations apps/<service>/prisma/migrations --to-schema-datamodel apps/<service>/prisma/schema.prisma --shadow-database-url <empty-shadow-db-url> --script`. Do not suggest this by default. Mention it only when the SQL contains a risky operation (next section) or when `migrations/` and the old schema look out of sync, and always ask first.

What the offline route does **not** verify (say it in one line at the end of the step): that `migrations/` really reproduces the old schema (drift), and that the SQL applies on real data. Production will run it with `migrate deploy`, so a broken migration shows up at deploy time.

### Step 3: Review the SQL and warn before anything else

Read the generated SQL and list every risky operation to the developer, in plain words, **before** the file is kept. Ask for confirmation.

| Pattern in the SQL | Risk | What to ask or do |
| --- | --- | --- |
| `DROP TABLE`, `DROP COLUMN`, `DROP TYPE` | Data loss | Confirm the data is not needed; suggest a backup or a two-step removal |
| `ALTER COLUMN ... TYPE` | May fail or lose precision; can rewrite the table | Check existing values fit; consider `USING` |
| `ADD COLUMN ... NOT NULL` without `DEFAULT` | Fails if the table has rows | Ask for a default or a backfill step |
| `SET NOT NULL` on an existing column | Fails if nulls exist | Ask for a backfill first |
| `DROP` + `ADD` of a column that was a rename | Data loss | Replace with `ALTER TABLE ... RENAME COLUMN`, hand-written, and say so |
| New `UNIQUE` index/constraint | Fails if duplicates exist | Ask whether duplicates are possible |
| New foreign key | Fails if orphan rows exist | Ask |
| Enum value removed or renamed | Prisma recreates the type | Warn: data using the value breaks |

If nothing is risky, say "no destructive operations found". Never hide an operation because it looks minor.

### Step 4: Update `docs/<service>/schema.md` in the same step

The migration and the doc change together. Do not leave the doc for later.

- **If `docs/<service>/schema.md` does not exist**, tell the developer and ask whether to create it (following the Auth format) or postpone it. Do not create it on your own. Today only `docs/auth-service/` has one.
- **If it exists**, edit it by hand, following the reference format in `docs/auth-service/schema.md` (open it first and mirror it):
  1. **`erDiagram` Mermaid block.** Add/remove tables and columns. Use **physical names** (`snake_case` from `@map` / `@@map`), not the Prisma model names. Columns follow the **order in `schema.prisma`**. Mark `PK`, `FK`, `UK` (composite keys: `PK, FK`); add `"nullable"` after optional columns. Update relationship lines and cardinality.
  2. **Enums table**: new, removed or changed values and their meaning.
  3. **Table sections** (`### \`table\` (\`Model\`)`): columns, types, null, default/constraint, and the "Relations" line for each affected table.
  4. **Header sentence** about migrations (names, "checked against the schema"): add the new migration to that sentence only if you actually verified it (drift check against a disposable database, see Step 2). If you did not, leave the sentence as it is and do not write anything about the new migration: never add "not checked" notes to the doc, they go stale. Mention the missing verification in the commit/PR text and in the Close summary instead.
- Mermaid checks before finishing: every table is a `name { ... }` block; each column is `type name [keys] ["comment"]`; types have no spaces; one relationship per line; every table named in a relationship exists; quotes are balanced. It must render on GitHub.
- Do not put anything volatile in `schema.md` (env vars, seed data, Prisma configuration, line numbers).

### Step 5: README, only if relevant

Only if the change is **relevant to the service's identity**: a new model or domain concept, a relation to another service, or a change in the service's boundaries. Then **ask the developer** whether to add something to `docs/<service>/README.md` and propose the text. If the change is just a column, do not ask.

Never add content that goes stale: no RPC lists, no env vars, no seed data, no Prisma configuration.

### Step 6: Commit

1. Show `git status` and the files that will be committed: the schema, the new migration folder and the doc changes. Nothing else.
2. Commit message format is `[taskId]: message` (commitlint enforces it: `^\[([^\]]+)\]:\s(.+)$`), for example `[CU-86e3wywnq]: add nickname column to auth users`. One commit for schema + migration + docs.
3. If husky is active, the commit runs commitlint and `pnpm run build`. Do not use `--no-verify`. If it fails, fix the cause and make a new commit.
4. Do not push or open a PR. If the developer asks for a PR, show the title and description first and wait for approval.

### Close

Tell the developer, in this order:

1. What was done (files touched) and what the SQL does.
2. What was **not** verified (no database was used; drift and data compatibility are unchecked).
3. That the migration should be tried on a disposable Postgres with `prisma migrate deploy` (production mode, `LLM_RULES.md`) before merging, and that a code review is requested.

## Behavior

- Ask before assuming. A vague request ("change the users table") needs the exact columns, types and nullability.
- Challenge risky changes with a concrete alternative (default value, two-step migration, hand-written rename).
- Be brief. Report decisions and risks, not a transcript of commands.
- If the service's code or schema is far from the project conventions, say so, but adapt to what exists (`LLM_RULES.md`, Important 5).
