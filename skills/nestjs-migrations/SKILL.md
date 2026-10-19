---
name: nestjs-migrations
license: MIT
description: Moves NestJS database schema changes out of app startup and into a reviewed, separate deploy step - no TypeORM synchronize true, migrationsRun, or dropSchema, no prisma db push, drizzle-kit push, MikroORM schema:update, or Mongoose syncIndexes in production; migrations generated and committed, then applied once per release by a Kubernetes Job, Helm or Argo CD hook, CI step, or PaaS release phase (typeorm migration:run, prisma migrate deploy, drizzle-kit migrate or the drizzle migrator, mikro-orm migration:up); a baseline for databases that synchronize created; a drift check in CI; expand and contract for renames and drops so the previous image keeps working and rollback is a redeploy. Use when TypeOrmModule has synchronize, the Dockerfile or entrypoint runs migrations before node, several replicas start at once, a column is renamed or dropped, or a rollback is planned, also when preparing a NestJS app for production or a deploy.
---

# NestJS migrations as a deploy step

Schema sync (`synchronize: true`, `prisma db push`, `drizzle-kit push`) applies whatever diff it computes, and a renamed field can look like a drop plus an add.
That is fine on a dev database and can destroy production data.
Migrations that run from app startup race when several replicas start at once.
During a rolling deploy the old and new versions share one schema, so each migration must keep the previous version working.
That same rule makes rollback simple: redeploy the previous image.

## Check

1. Detect the ORM from `package.json`: `typeorm` with `@nestjs/typeorm`, `prisma` with `@prisma/client`, `drizzle-orm` with `drizzle-kit`, `@mikro-orm/core`, or `mongoose`.
2. Search `src/`, config files, and scripts for startup schema changes:
   - TypeORM: `synchronize:`, `migrationsRun`, `dropSchema`, `.synchronize(`, `.runMigrations(`.
   - Prisma: `db push`, `migrate dev`, `migrate reset`, `--accept-data-loss`.
   - Drizzle: `drizzle-kit push`, `migrate(` called from `main.ts`, `onModuleInit`, or `onApplicationBootstrap`.
   - MikroORM: `schema:update`, `schema.update(`, `updateSchema(`, `migrator.up(` in app code.
   - Mongoose: `syncIndexes(`, `autoIndex`.
   - Pass: none of these run when the production app starts.
     `synchronize: false` or absent.
3. Open the `Dockerfile`, entrypoint scripts, `Procfile`, `package.json` `start*` scripts, and deploy manifests.
   Fail: a command that runs migrations and then starts Node in the same container (`migrate deploy && node dist/main.js`).
4. Check that migration files exist and are committed (`src/**/migrations/`, `prisma/migrations/`, the Drizzle `out` folder).
   If there are none and the app used schema sync, the production schema has no baseline (Apply step 3).
5. Find the deploy step.
   Pass: one step per release applies migrations before the new version takes traffic (Kubernetes Job or hook, CI step, PaaS release phase), with the same image tag as the release.
6. Review migrations added since the last release for drops and renames of columns or tables that the running version still reads.

## Apply

1. Turn off sync and startup migrations in the app.
   For TypeORM in the root module, set `synchronize: false` (or remove the key) and remove `migrationsRun` and `dropSchema`.
   Do not keep `synchronize: process.env.NODE_ENV !== 'production'`: one wrong env value syncs production.
   Remove `db push`, `drizzle-kit push`, `schema:update`, and `syncIndexes()` from startup code and start scripts.
2. Give the migration CLI its own data source.
   For TypeORM, add `src/database/data-source.ts`.
   Nest does not load this file; the CLI does.

   ```typescript
   import { DataSource } from 'typeorm';

   export default new DataSource({
     type: 'postgres',
     url: process.env.DATABASE_URL,
     entities: [`${import.meta.dirname}/../**/*.entity.js`],
     migrations: [`${import.meta.dirname}/migrations/*.js`],
   });
   ```

   It points at the compiled files, so the CLI runs the same JavaScript as production.
   `import.meta.dirname` needs Node 20.11 or later.
   Add scripts with the project's package manager, and Makefile targets if the project has a Makefile:

   ```json
   "migration:generate": "nest build && typeorm migration:generate -d dist/database/data-source.js",
   "migration:run": "typeorm migration:run -d dist/database/data-source.js"
   ```

   Generate with `npm run migration:generate -- src/database/migrations/<Name>`, read the SQL, and commit it.
   Prisma uses `prisma migrate dev` locally; Drizzle uses `drizzle-kit generate`; MikroORM uses `mikro-orm migration:create`.
3. Baseline a database that schema sync created.
   Generate the first migration against an empty local database, so it creates the full schema.
   Production already has those tables, so it must be recorded as applied, not run.
   - TypeORM: `typeorm migration:run --fake -d dist/database/data-source.js` records pending migrations without running them.
   - Prisma: `prisma migrate resolve --applied <migration_name>`.
   - Others: check the ORM's docs for its baseline command.

   Before the fake run, prove that production matches the entities: run the drift check from step 6 against production or a fresh copy of it.
   An empty diff means the baseline is safe.
   Production credentials belong to the user: ask them to run it, or to give you access to a copy.
4. Apply migrations as a separate step, once per release, with the release's image.
   Use an immutable tag (commit SHA or version) for both the app and the migration step, not `latest`.
   Kubernetes:

   ```yaml
   apiVersion: batch/v1
   kind: Job
   metadata:
     name: orders-api-migrate-<release>
   spec:
     backoffLimit: 0
     template:
       spec:
         restartPolicy: Never
         containers:
           - name: migrate
             image: registry.example.com/orders-api:<release>
             command: ["node", "node_modules/typeorm/cli.js", "migration:run", "-d", "dist/database/data-source.js"]
             envFrom:
               - secretRef:
                   name: orders-api
   ```

   - Plain `kubectl`: apply the Job, `kubectl wait --for=condition=complete job/orders-api-migrate-<release> --timeout=10m`, then apply the Deployment.
   - Helm: annotate the Job with `helm.sh/hook: pre-install,pre-upgrade`.
     Argo CD: `argocd.argoproj.io/hook: PreSync`.
   - Docker Compose: a `migrate` service, and the app `depends_on` it with `condition: service_completed_successfully`.
   - PaaS: the release phase (`release:` in a Heroku `Procfile`, `release_command` in `fly.toml`, the pre-deploy command on Render).
   - CI only: a job before the deploy job, with the production `DATABASE_URL` from the CI secret store.
     Ask the user to add the secret.

   The CLI must exist in the image that runs the step.
   `typeorm` and `drizzle-orm` are runtime dependencies, so `npm prune --omit=dev` keeps them.
   `prisma`, `drizzle-kit`, and `@mikro-orm/cli` are usually dev dependencies: run them from a CI step with dev dependencies, a separate Docker build target, or move them to `dependencies`.
   With Drizzle you can avoid `drizzle-kit` in production with a small script, compiled with the app and run by the Job:

   ```typescript
   import { drizzle } from 'drizzle-orm/node-postgres';
   import { migrate } from 'drizzle-orm/node-postgres/migrator';
   import pg from 'pg';

   const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
   try {
     await migrate(drizzle(pool), { migrationsFolder: `${import.meta.dirname}/../../drizzle` });
   } finally {
     await pool.end();
   }
   ```

   Point `migrationsFolder` at the folder `drizzle-kit generate` writes to, and copy it into the image.
5. Split breaking changes with expand and contract.
   Rename `customerEmail` to `email`, as three releases:
   1. Expand: add `email` as nullable.
      The code writes both columns and reads `email ?? customerEmail`.
      Backfill in batches in a separate migration or job.
   2. Switch: make the code read and write only `email`.
      The same release's migration drops `NOT NULL` from `customerEmail`, or inserts fail once the code stops writing it.
      Add `NOT NULL` to `email` once the backfill is done.
   3. Contract: drop `customerEmail`, only after no running or rollback-target image reads it.

   The same applies to dropping a column or table, adding `NOT NULL` without a default, and changing a type.
   On Postgres, build indexes on large tables with `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction: in TypeORM set `transaction = false` on that migration class and `migrationsTransactionMode: 'each'` on the data source.
   If a change cannot be split, tell the user it cannot be rolled back by a redeploy, and get an explicit yes before it ships.
6. Add a drift check to CI, against a throwaway database: apply all migrations, then fail if the models still differ.
   - TypeORM: `typeorm migration:run -d dist/database/data-source.js`, then `typeorm migration:generate src/database/migrations/Drift --check -d dist/database/data-source.js` (exit 1 on drift).
   - Prisma: `prisma migrate diff` with `--exit-code` (exit 2 when not empty).
     Read `--help` for the source and target flags of the installed version.
   - Drizzle: `drizzle-kit check` checks migration consistency.
     MikroORM: `mikro-orm migration:check`.
7. Document rollback in the deploy notes: redeploy the previous image tag.
   Do not plan on down-migrations during an incident.

## Verify

1. Start the app against an empty database (local Postgres or the project's compose file).
   It must boot and create no tables: `psql "$DATABASE_URL" -c '\dt'` shows nothing from your entities.
2. Run the migration step the way the deploy will, from the built image if there is one: `docker run --rm -e DATABASE_URL=... <image> node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js`.
   Expect exit 0, then run it again and expect exit 0 with nothing to run.
3. Run the drift check from Apply step 6 and expect exit 0.
   Add a column to an entity without a migration and expect a non-zero exit, then revert.
4. For a database that sync created: on a copy, a plain `migration:run` fails with `relation ... already exists`, `migration:run --fake` succeeds, and `migration:show` lists the baseline as applied.
5. Prove rollback: apply the new migrations, then run the previous release's e2e tests (check out its tag) against that database.
   They must pass.
6. Validate the manifests with the project's tooling (`kubectl apply --dry-run=server`, `helm template`, `kubeconform`) when a cluster or the tool is available, and say so if it is not.

## Gotchas

- With `synchronize: true`, a rollback is destructive: the previous image syncs the schema back to its own entities and drops the columns the newer version added, with their data.
- The TypeORM CLI forces `synchronize`, `migrationsRun`, and `dropSchema` off while it runs, so the app config cannot leak into the migration step.
  The app itself has no such guard.
- TypeORM's `migration:run` does not take a database lock.
  Run exactly one migration Job per release; do not start it from every replica or init container.
- Running migrations in an `initContainer` or entrypoint has the same race as `migrationsRun: true`, once per pod.
- `migration:generate` needs a database at the current migrated state; against a stale database it adds unrelated changes.
  Read every generated migration.
- A TypeORM migration's `transaction = false` works only with `migrationsTransactionMode` set to `each` or `none`.
- `syncIndexes()` in Mongoose also drops indexes that are not in the schema.
  Mongoose has no schema migrations; build indexes in a deploy step if `autoIndex` is off.
- An image tagged `latest` cannot be "redeployed as the previous version".
  Rollback needs immutable tags.
- Down-migrations that drop a column lose the data written since the up.
  Prefer a forward fix.

## Related skills

- `nestjs-connection-pool`: the migration Job is one more database client during the deploy window.
- `nestjs-graceful-shutdown`: the image and `CMD` that the migration Job reuses.
- `nestjs-config-validation`: `DATABASE_URL` for the Job comes from the same secret store, never from the image.
- `nestjs-dependency-updates`: ORM major upgrades often change migration commands and generated SQL.
- `nestjs-scheduled-jobs`: backfill jobs on several replicas need the same single-run guard as cron.
