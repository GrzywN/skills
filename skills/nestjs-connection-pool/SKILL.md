---
name: nestjs-connection-pool
license: MIT
description: Checks and fixes database connection pool sizing for a NestJS app before it scales. Finds every pool (TypeORM poolSize or extra.max, Drizzle node-postgres Pool max, Prisma connection_limit or PrismaPg max, MikroORM pool.max, Mongoose maxPoolSize, Knex), sets the size explicitly from config, and checks that pool size times the peak number of processes (replicas, the rolling-deploy surge and terminating pods, HPA maxReplicas, BullMQ workers, migration jobs, admin tools) fits in Postgres max_connections, adding PgBouncer or a managed pooler when it does not. Use when you see "sorry, too many clients already", "remaining connection slots are reserved", pool or connection timeouts during deploys or traffic spikes, when you raise replicas, add autoscaling, add a worker or a read replica, or touch TypeOrmModule.forRoot, DATABASE_URL or the Kubernetes Deployment. Also use when preparing a NestJS app for production or a deploy, even if the user does not mention connections or pools.
---

# Connection pool math

Every replica has its own pool.
Five replicas with a pool of 20 open 100 connections, which is Postgres's default `max_connections`, before the migration job, the workers, an admin tool, or the minute of a deploy when old and new pods run together.
The failure only shows during deploys and scale-outs, so it is rarely seen before production.

## Check

1. Find every pool and its maximum.
   Search for `TypeOrmModule.forRoot`, `poolSize`, `extra:`, `new Pool(`, `drizzle(`, `PrismaClient`, `PrismaPg`, `connection_limit`, `MikroOrmModule`, `pool:`, `MongooseModule.forRoot`, `maxPoolSize`, `knex(`.
   Also count pools inside one process: several `DataSource`s, TypeORM `replication` (one pool for the master and one per slave), a second `PrismaClient`, a client created in a request-scoped provider.
   An unset maximum falls back to the driver default:

   | Client | Option | Default |
   | --- | --- | --- |
   | `pg` (TypeORM, Drizzle, Prisma 7 `PrismaPg`) | `max` | 10 |
   | TypeORM | `poolSize`, overridden by `extra.max` | the `pg` default |
   | Prisma 6 and earlier | `connection_limit` in the URL | physical CPUs x 2 + 1 |
   | MikroORM | `pool.max` | check the driver |
   | MongoDB driver (Mongoose) | `maxPoolSize` | 100 |

2. Count the processes that open a pool, at their peak.
   - API pods: `replicas`, or `maxReplicas` of a HorizontalPodAutoscaler.
   - The deploy surge: `strategy.rollingUpdate.maxSurge`, 25% by default and rounded up.
     Kubernetes does not count terminating pods, which keep their connections until they exit, so a rolling update can briefly run up to twice the replicas; blue/green always does.
   - Workers: a separate Deployment for BullMQ processors, or the same image started in worker mode.
   - The migration Job or release phase, and `synchronize` or `migrationsRun` on boot.
   - Other clients: admin tools, BI, cron containers, other services on the same database.
3. Get the database limit.
   Usable connections are `max_connections` minus `superuser_reserved_connections` (default 3) and, from Postgres 16, `reserved_connections`.
   Read them with `SHOW max_connections;` against a non-production database, or from the infrastructure code.
   For production values on a managed database, ask the user; do not connect to production on your own.
4. Add it up: the sum of peak processes times pool max, plus other clients, must fit in the usable connections with headroom.

The check passes when every pool maximum is explicit and the sum fits at the deploy peak.

In the orders fixture: TypeORM sets `extra: { max: 30 }`, the Deployment has 3 replicas and no strategy, the BullMQ processor runs in the same process and pool, and `synchronize: true` runs on every boot.
The default surge adds a fourth pod, so the deploy peak is at least 4 x 30 = 120, over the 97 usable connections of a default Postgres, and terminating pods push it higher.

## Apply

### 1. Pick the size from the budget

```text
pool max <= (usable connections - other clients - migration job) / peak pods
```

A bigger pool is not faster.
Postgres does its best work with a modest number of active connections, and extra connections only queue inside the database.
Start from the driver default of 10, lower it to fit the budget, and raise it only when measurements show requests waiting for a connection.

### 2. Set it explicitly, from config

Read the size from a validated, coerced config value (see `nestjs-config-validation`), so each process type can get its own.
With TypeORM, replace `extra: { max: 30 }`, because `extra.max` silently overrides `poolSize`:

```typescript
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    autoLoadEntities: true,
    // Budget: (3 replicas + 3 during a rollout) x 10 + 2 (migration Job) + 5 (admin) = 67 of 97 usable.
    poolSize: config.getOrThrow<number>('DB_POOL_MAX'),
    applicationName: 'orders-api',
    connectTimeoutMS: 5_000,
  }),
}),
```

Drizzle with `node-postgres`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';

export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX),
    application_name: 'orders-api',
    connectionTimeoutMillis: 5_000,
  },
});
```

Prisma 7 with `@prisma/adapter-pg`:

```typescript
import { PrismaPg } from '@prisma/adapter-pg';

export const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX),
  application_name: 'orders-api',
  connectionTimeoutMillis: 5_000,
});
```

Prisma 6 and earlier take `?connection_limit=10&pool_timeout=10` in the URL.
MikroORM takes `pool: { max }`, and Mongoose takes `maxPoolSize` in the connection options.

- `applicationName` / `application_name` makes `pg_stat_activity` show which process holds which connections.
- A connection timeout makes a saturated pool fail fast; `pg` waits forever by default.

### 3. Make the deploy peak explicit

Set the rollout strategy, so the surge is a number you chose:

```yaml
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

Count terminating pods too: they drain for up to `terminationGracePeriodSeconds` (see `nestjs-connection-draining`).
With an HPA, use `maxReplicas`, not `replicas`.

### 4. Size the other processes

Give workers and the migration Job their own `DB_POOL_MAX`.
A migration run needs one or two connections.
A worker needs about as many connections as its job concurrency.

### 5. When it does not fit, add a pooler

Do not raise `max_connections`: every connection is a Postgres process with its own memory, and the change needs a restart.
Put PgBouncer in transaction mode between the app and the database, or use the managed pooler of the provider.
Point the app pools at the pooler, and keep a direct URL for migrations.
Ask the user before provisioning anything that costs money.

## Verify

1. Prove the cap under load, against the project's Postgres:

   ```typescript
   import { Test } from '@nestjs/testing';
   import { setTimeout } from 'node:timers/promises';
   import { DataSource } from 'typeorm';
   import { expect, it } from 'vitest';
   import { AppModule } from '../src/app.module.js';

   it('opens at most DB_POOL_MAX connections under load', async () => {
     const app = await Test.createTestingModule({ imports: [AppModule] }).compile();
     await app.init();
     const observer = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, poolSize: 1 }).initialize();
     try {
       const load = Promise.all(Array.from({ length: 50 }, () => app.get(DataSource).query('SELECT pg_sleep(0.2)')));
       await setTimeout(100);
       const [{ count }] = await observer.query(
         `SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1`,
         ['orders-api'],
       );
       await load;
       expect(count).toBe(Number(process.env.DB_POOL_MAX));
     } finally {
       await observer.destroy();
       await app.close();
     }
   });
   ```

2. Rehearse the deploy peak locally.
   Start Postgres with the production limit (`postgres -c max_connections=100`), run as many app processes as the peak (`docker compose up --scale api=6`), put load on them, and check the logs for `too many clients` and `remaining connection slots are reserved`.
3. During a real rolling deploy in staging, watch `SELECT application_name, count(*) FROM pg_stat_activity GROUP BY 1;` and compare the maximum with the budget.
4. Put the budget arithmetic in the pull request description, with the numbers you assumed and where each came from.

## Gotchas

- Postgres answers a non-superuser with `remaining connection slots are reserved for roles with the SUPERUSER attribute` before `sorry, too many clients already`; both mean the same thing.
- TypeORM merges `extra` over its own options, so `extra.max` beats `poolSize`.
- The Prisma 6 default depends on the CPU count of the node, so a bigger node silently opens more connections.
- PgBouncer in transaction mode breaks session state: `SET`, session advisory locks, `LISTEN`/`NOTIFY`, temporary tables.
  Named prepared statements need PgBouncer 1.21 or later with `max_prepared_statements` above 0.
  Add `pgbouncer=true` to a Prisma URL only for PgBouncer below 1.21.
- Prisma Migrate cannot run through PgBouncer; give the CLI a direct URL.
- Lock and idempotency stores use the app pool: one statement per held lock every `ttl / 3`, and two or three per idempotent request (see `nestjs-scheduled-jobs`, `nestjs-idempotent-writes`).
- A client created in a request-scoped provider opens a pool per request (see `nestjs-request-scope`).
- Tests that create a `DataSource` or `PrismaClient` per test and never close it leak connections, and CI fails with the same errors.

## Related skills

- `nestjs-config-validation`: `DB_POOL_MAX` is a required, coerced number.
- `nestjs-migrations`: the migration Job is a client, and it needs a direct URL behind a pooler.
- `nestjs-graceful-shutdown` and `nestjs-connection-draining`: pools close on `SIGTERM`, and draining pods hold connections meanwhile.
- `nestjs-outbound-timeouts`: `statement_timeout` keeps slow queries from holding connections.
- `nestjs-scheduled-jobs` and `nestjs-idempotent-writes`: their stores add load to the pool.
- `nestjs-observability`: alert on pool waits and on connections near the limit.
