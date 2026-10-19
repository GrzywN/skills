---
name: nestjs-scheduled-jobs
license: MIT
description: Makes NestJS scheduled and queued jobs safe on several replicas. Finds @Cron(), @Interval() and @Timeout() jobs from @nestjs/schedule that run on every instance, adds @nestjs/locks (LocksModule, @OnOneInstance, @WithoutOverlapping, a shared LockStore on Postgres or Redis, LocksContext signal and fencingToken), rewrites jobs to process what is still due instead of "yesterday's rows", and sets BullMQ defaultJobOptions (attempts, backoff, removeOnComplete, removeOnFail), jobId and idempotent processors. Use when a cron job runs twice or three times, invoices or emails go out more than once, a long job overlaps itself, the app scales to more than one replica, pod or instance, you touch ScheduleModule, SchedulerRegistry, @Processor or WorkerHost, BullMQ jobs stall or never retry, or Redis fills up with old jobs. Also use when preparing a NestJS app for production or a deploy, even if the user does not mention cron, locks or queues.
---

# Scheduled jobs on many replicas

`@Cron()`, `@Interval()` and `@Timeout()` run inside each process.
Three replicas run the nightly export three times, and a dev machine never shows it.
A rolling deploy runs old and new pods side by side, so even one replica can run a tick twice.
Queues have the same problem in another form: BullMQ does not retry unless told to, runs a stalled job again, and keeps finished jobs in Redis forever.

## Check

1. List the jobs.
   Search for `@Cron(`, `@Interval(`, `@Timeout(`, `SchedulerRegistry`, `addCronJob(` and `setInterval(` in providers.
2. Find how many instances run at once.
   Read `replicas:` and `strategy:` in the Kubernetes manifests, `maxReplicas` in a HorizontalPodAutoscaler, `deploy.replicas` in compose files, or the instance count of the PaaS.
   More than one instance at any moment, deploys included, means every job needs a lock.
3. For each job method, look for `@OnOneInstance(` or `@WithoutOverlapping(` with an explicit `key`.
4. Look for the lock store: `@nestjs/locks` in `package.json`, `LocksModule.forRoot` in the root module, and one provider that calls `registerSource(this)` on `LocksStorage`.
   `allowInMemoryStorage: true` on an app with more than one instance is a fail.
5. Read each job body.
   A time window fails: `Between(`, `yesterday`, `24 * 60 * 60 * 1000`, `setHours(0`.
   A skipped tick loses that window for good.
   It passes when it selects what is still due, for example `invoiceExported: false`.
6. Check BullMQ.
   `defaultJobOptions` in `BullModule.forRoot`, `forRootAsync` or `registerQueue` sets `attempts`, `backoff`, `removeOnComplete` and `removeOnFail`.
   Every `queue.add(` or `addBulk(` that must not create duplicates passes a `jobId`.
   Every `process(` checks state before its side effect, and throws when the side effect fails.
7. Check that `main.ts` calls `app.enableShutdownHooks()` (see `nestjs-graceful-shutdown`).

The check passes when every job holds a lock on a shared store, processes current state, and every queue job is safe to run twice.

## Apply

### 1. Install

Detect the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`) and use the Makefile target when the project has one.
Install `@nestjs/locks`.
This skill is checked against 0.0.3, which needs `@nestjs/common` and `@nestjs/core` 11 or 12 and Node 20.19 or later.
On an older Nest, go to step 7.

### 2. Add a shared lock store

The package ships only `InMemoryLockStore`, which excludes callers in one process.
You implement `LockStore` (`acquire`, `renew`, `release`) on a store every instance shares.

- Use Postgres when the app has it: the fencing counter is a sequence, and it never goes back.
- Use Redis when there is no SQL database, and only with persistence and `maxmemory-policy noeviction`.

Copy the store and its migration from `references/lock-stores.md`.
Create the table and the sequence with a migration, not with `synchronize` (see `nestjs-migrations`).

### 3. Register the module and the store

```typescript
@Module({
  imports: [
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    // ...the ORM module, feature modules
  ],
  providers: [TypeOrmLockStore],
})
export class AppModule {}
```

The store registers itself in its constructor, so there is nothing to configure.
`LocksModule.forRoot()` takes `ttl` (default `'30s'`), `clock` (tests) and `allowInMemoryStorage`.
It is global by default.

### 4. Lock every job, and make it process what is still due

Missed ticks are not replayed, so a job must catch up on its own.
In the orders fixture, `exportYesterday()` becomes:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { OnOneInstance, WithoutOverlapping } from '@nestjs/locks';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Order } from '../orders/order.entity.js';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectQueue('invoices') private readonly queue: Queue,
  ) {}

  @Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoices-export' })
  @OnOneInstance({ key: 'invoices:export' })
  @WithoutOverlapping()
  async exportPending(): Promise<number> {
    const pending = await this.orders.find({
      select: { id: true },
      where: { status: 'paid', invoiceExported: false },
    });
    await this.queue.addBulk(
      pending.map((order) => ({
        name: 'send-invoice',
        data: { orderId: order.id },
        opts: { jobId: `invoice-${order.id}` },
      })),
    );
    return pending.length;
  }
}
```

- `@OnOneInstance()` gives the job to one instance, which keeps a lease on `<key>:owner` and renews it every `ttl / 3`.
  The other instances skip the tick, and the call resolves `undefined`.
  After a crash, another instance takes the job at its first tick after `ttl`.
- `@WithoutOverlapping()` skips a tick while a run still holds `<key>`, on any instance.
  Add it to every job that can run longer than its interval.
- Set `key` on every job.
  The default is `ClassName.methodName`, and a rename during a rolling deploy lets old and new pods each run the job.
- The cron expression comes from the environment, with the real schedule as the default, so tests and local runs can speed it up.

### 5. Stop work when the lock is lost

A paused process (GC, partition, blocked event loop) can wake up after another instance took over.
Inject `LocksContext` and pass `locksContext.signal` to the I/O the job does.
When a job writes something a stale run must not overwrite, fence the write with `locksContext.fencingToken`: read `references/fencing.md`.

### 6. Make queue jobs safe to repeat

Set the job options once, for every queue:

```typescript
BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: { url: config.getOrThrow<string>('REDIS_URL') },
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  }),
}),
```

Then make `InvoicesProcessor.process()` check state first, fail loudly, and update conditionally:

```typescript
async process(job: Job<{ orderId: string }>) {
  const order = await this.orders.findOneByOrFail({ id: job.data.orderId });
  if (order.invoiceExported) {
    return;
  }
  const response = await fetch('https://mailer.example.com/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: order.customerEmail, template: 'invoice', orderId: order.id }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Mailer answered ${response.status} for order ${order.id}`);
  }
  await this.orders.update({ id: order.id, invoiceExported: false }, { invoiceExported: true });
}
```

A crash between the send and the update still sends twice.
If the mailer or provider accepts an idempotency key, send `invoice-<orderId>` with the request.

### 7. Fallback for Nest 10 or older

Upgrade first if you can (see `nestjs-dependency-updates`).
Otherwise move the schedule into BullMQ, which creates one job per tick for all workers (bullmq 5.16 or later):

```typescript
await this.queue.upsertJobScheduler('invoices-export', { pattern: '0 2 * * *' }, { name: 'export-pending' });
```

Call it on boot, remove the `@Cron()`, and keep the processor idempotent as in step 6.

## Verify

1. Run the store contract suite against the real database or Redis, with `concurrent` on (see `references/lock-stores.md`).
2. Run the job on three instances of the real `AppModule`, on the project's Postgres and Redis (docker compose or testcontainers):

   ```typescript
   import { Test, type TestingModule } from '@nestjs/testing';
   import { afterAll, beforeAll, expect, it } from 'vitest';
   import { AppModule } from '../src/app.module.js';
   import { InvoicesService } from '../src/invoices/invoices.service.js';

   let replicas: TestingModule[] = [];

   beforeAll(async () => {
     replicas = await Promise.all(
       [1, 2, 3].map(async () => {
         const replica = await Test.createTestingModule({ imports: [AppModule] }).compile();
         await replica.init();
         return replica;
       }),
     );
   });

   afterAll(() => Promise.all(replicas.map((replica) => replica.close())));

   it('runs the nightly export on one of three replicas', async () => {
     const runs = await Promise.all(replicas.map((replica) => replica.get(InvoicesService).exportPending()));
     expect(runs.filter((queued) => queued !== undefined)).toHaveLength(1);
   });
   ```

   Run it once with the decorators removed and watch it fail with three runs.
   Vitest needs `unplugin-swc` for Nest decorators; reuse the project's e2e config.
3. Prove the production guard: with `NODE_ENV=production` and no store provider, `app.init()` rejects with `no LockStore is registered`.
4. Boot the app and read the log line `LocksStorage: TypeOrmLockStore` (or your store's class name).
5. Locally, start three instances on different ports with `INVOICE_EXPORT_CRON='*/10 * * * * *'` and the `debug` log level.
   One logs `runs on this instance`, the others log `Skipped ... it runs on another instance`.
   Kill the owner with `kill -9` and watch another instance take over after `ttl`.
6. Add the same `jobId` twice and check that `queue.getJobCountByTypes('waiting')` is 1.

## Gotchas

- Missed ticks are never caught up: up to `ttl` of ticks are skipped after the owner crashes, and ticks during a long run are dropped.
- `@OnOneInstance()` alone does not stop overlap on the owner, and `@Cron(expression, { waitForCompletion: true })` only stops it on one instance.
- A decorated method throws `LocksModule doesn't know this instance` when the class is created with `new` or is request-scoped or transient.
  Unit-test it through a Nest testing module.
- The decorated method always returns a promise, and skipped calls resolve `undefined`.
- When the store fails, the job does not run and the call throws.
- `LocksModule.forRoot({ store })` throws: the store is registered from its constructor, never as an option.
  Registering later (a lifecycle hook, a lazy module) also throws.
- `pg` returns `bigint` as a string, and the package refuses a string fencing token.
  Convert with `Number()`.
- TypeORM's `dataSource.query()` answers a top-level `UPDATE` or `DELETE` with `[rows, count]`, not rows.
- The docs at docs.nestjs.com mention a `storeTimeout` option and `LockStoreTimeoutError`.
  Version 0.0.3 has neither, so check `node_modules/@nestjs/locks/dist/interfaces/locks-module-options.interface.d.ts` before using them.
- Skipped ticks are logged at `debug`, so they are invisible at production log levels.
- Without `enableShutdownHooks()`, a deploy leaves the lease to expire, and the job pauses for up to `ttl`.
- BullMQ: `attempts` defaults to 1, finished jobs stay until removed, and age-based removal only runs when another job finishes.
- BullMQ: a custom `jobId` must not be an integer or contain `:` (`add()` throws), and it only deduplicates while the job is still in Redis.
  After `removeOnComplete` deletes the job, the same id runs again, so the processor still checks state.
- BullMQ marks a job stalled when its worker dies or blocks the event loop past `lockDuration` (30 s by default), and runs it again.
  BullMQ also logs `Eviction policy is ... It should be "noeviction"` at startup when Redis may evict keys.

## Related skills

- `nestjs-idempotent-writes`: the same shared-store pattern for HTTP retries, often on the same Postgres or Redis.
- `nestjs-graceful-shutdown`: `enableShutdownHooks()` hands leases back and lets BullMQ workers finish.
- `nestjs-connection-draining`: the grace period must cover the longest job.
- `nestjs-connection-pool`: lease renewals and workers use connections from the pool.
- `nestjs-migrations`: the locks table and sequence ship as a migration.
- `nestjs-outbound-timeouts` and `nestjs-resilience`: timeouts and retries for what jobs call.
- `nestjs-observability`: alert on `lock-lost` from `LocksEvents` and on failed jobs.
