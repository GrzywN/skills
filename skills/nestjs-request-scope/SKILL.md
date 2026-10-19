---
name: nestjs-request-scope
license: MIT
description: Finds and removes unintended request-scoped chains in a NestJS app. Scope.REQUEST and @Inject(REQUEST) propagate up the dependency graph to every service and controller that injects them, so one request-scoped logger can rebuild a dozen objects per request, silently disable @Cron jobs and onModuleInit hooks, and break app.get(). Lists the chain with NEST_DEBUG or a preview-mode test, then replaces per-request data with AsyncLocalStorage or nestjs-cls (ClsModule, ClsService) and per-tenant instances with durable providers (ContextIdStrategy, durable flag). Use when a provider is Scope.REQUEST or injects REQUEST or CONTEXT, when latency or GC grows with traffic, when a log line needs a request id or tenant, when a cron job logs "Cannot register cron job ... non static provider", or when "is marked as a scoped provider" appears. Also use when preparing a NestJS app for production or a deploy, also when the user does not say "request scope".
---

# NestJS request scope

`Scope.REQUEST` is contagious.
Every provider that injects a request-scoped provider becomes request-scoped, and so does everything that injects that, up to the controllers.
Nest then builds that whole chain again for each request, which costs latency and garbage collection under load, and no code says so.
Request-scoped providers also lose features that singletons have: cron decorators, lifecycle hooks, and `app.get()`.
Most chains exist only to read one value from the request, and `AsyncLocalStorage` gives that value without rebuilding the graph.

## Check

- [ ] Search `src/` for `Scope.REQUEST`, `scope: Scope.REQUEST`, `@Inject(REQUEST)`, `REQUEST } from '@nestjs/core'`, `CONTEXT } from '@nestjs/graphql'`, `durable: true`, `ContextIdFactory`.
  Each hit is the bottom of a chain.
- [ ] For each hit, search for its class name in constructors, and repeat for every class you find, up to the controllers.
  Include modules that import an exported provider from the chain.
- [ ] Get the real list from Nest instead of reading by hand.
  Start the app with `NEST_DEBUG=1` and keep the lines that contain `introspected as request-scoped`.

  ```bash
  NEST_DEBUG=1 node dist/main.js 2>&1 | grep 'introspected as request-scoped'
  ```

  `REQUEST` itself is not printed.
  Every other line is a class built per request.
  If the app cannot boot locally, use the preview-mode test in Verify, which needs no database.
- [ ] For every class in the chain, note what it needs from the request.
  A value (request id, user id, tenant id, locale) is per-request data.
  A different object per tenant (connection, client) is a per-tenant instance.
  A different object per request is rare.
- [ ] Search the chain for `@Cron(`, `@Interval(`, `@Timeout(`, `onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy`, `onApplicationShutdown`, `@Processor(`, `@OnWorkerEvent(`, `app.get(`.
  These break or are skipped in request-scoped classes.
- [ ] Search `APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE`, `APP_FILTER` providers for a dependency on the chain.

Pass: no class is request-scoped unless it needs a different instance per request, and each one that is has a comment that says why.

## Apply

Detect the package manager from the lockfile and use the Makefile targets when the project has them.

1. Per-request data: move it to `AsyncLocalStorage` and make the chain singletons again.
   This version has no dependency and works on Express and Fastify, because Nest middleware gets the Node `IncomingMessage` on both.

   ```ts
   import { AsyncLocalStorage } from 'node:async_hooks';
   import { Injectable } from '@nestjs/common';

   export interface RequestContextStore {
     requestId: string;
     userId?: string;
   }

   @Injectable()
   export class RequestContext {
     private readonly als = new AsyncLocalStorage<RequestContextStore>();

     run<T>(store: RequestContextStore, callback: () => T): T {
       return this.als.run(store, callback);
     }

     get requestId(): string | undefined {
       return this.als.getStore()?.requestId;
     }
   }
   ```

   ```ts
   import { randomUUID } from 'node:crypto';
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import { Global, Injectable, MiddlewareConsumer, Module, NestMiddleware, NestModule } from '@nestjs/common';
   import { RequestContext } from './request-context.js';

   @Injectable()
   export class RequestContextMiddleware implements NestMiddleware {
     constructor(private readonly context: RequestContext) {}

     use(req: IncomingMessage, _res: ServerResponse, next: () => void) {
       const header = req.headers['x-request-id'];
       const requestId = typeof header === 'string' && header !== '' ? header : randomUUID();
       this.context.run({ requestId }, next);
     }
   }

   @Global()
   @Module({
     providers: [RequestContext],
     exports: [RequestContext],
   })
   export class RequestContextModule implements NestModule {
     configure(consumer: MiddlewareConsumer) {
       consumer.apply(RequestContextMiddleware).forRoutes('*path');
     }
   }
   ```

   Import `RequestContextModule` in `AppModule`.
   `'*path'` is the route syntax of Nest 11 and later; on Nest 10 use `'*'`.
   Then turn the bottom of the chain into a singleton that reads the store.

   ```ts
   import { Injectable } from '@nestjs/common';
   import { RequestContext } from './request-context.js';

   @Injectable()
   export class RequestLogger {
     constructor(private readonly context: RequestContext) {}

     log(message: string) {
       console.log(`[${this.context.requestId ?? '-'}] ${message}`);
     }
   }
   ```

   Remove `scope: Scope.REQUEST` and `@Inject(REQUEST)` from every class in the chain.
   Set the user id in the store from the auth guard or middleware, not in each service.
2. Or use `nestjs-cls` when the project already has it, or when it also needs its plugins (for example transactions).
   Version 7.0.1 is current, needs Node 22 or later, and supports `@nestjs/common` and `@nestjs/core` from 10 to 12.
   Install it with the project's package manager.

   ```ts
   import { randomUUID } from 'node:crypto';
   import type { IncomingMessage } from 'node:http';
   import { Injectable, Module } from '@nestjs/common';
   import { ClsModule, ClsService } from 'nestjs-cls';

   @Injectable()
   export class RequestLogger {
     constructor(private readonly cls: ClsService) {}

     log(message: string) {
       console.log(`[${this.cls.getId() ?? '-'}] ${message}`);
     }
   }

   @Module({
     imports: [
       ClsModule.forRoot({
         global: true,
         middleware: {
           mount: true,
           generateId: true,
           idGenerator: (req: IncomingMessage) => {
             const header = req.headers['x-request-id'];
             return typeof header === 'string' && header !== '' ? header : randomUUID();
           },
         },
       }),
     ],
     providers: [RequestLogger],
     exports: [RequestLogger],
   })
   export class LoggingModule {}
   ```

3. Code outside HTTP (cron, BullMQ processors, microservice handlers) has no store until you open one.
   Wrap the job in `context.run({ requestId: job.id ?? randomUUID() }, () => ...)`, or with nestjs-cls put `@UseCls({ generateId: true, idGenerator: () => randomUUID() })` on the async method.
4. Per-tenant instances: make the provider durable, so Nest builds one sub-tree per tenant instead of one per request.
   Read `references/durable-providers.md` when you do this, for the strategy, the provider, and their traps.
5. Keep a provider request-scoped only when it needs a different object per request, and inject it as close to the handler as possible.
   Add a one-line comment that says why, so the next review does not have to rediscover it.

## Verify

1. Add a test that lists every request-scoped class from the real `AppModule` and fails on anything not allowed.
   Preview mode builds the graph without creating providers, so it needs no database or Redis.
   `ConfigModule` validation still runs, so give the test the env vars the existing tests use.

   ```ts
   import { ModulesContainer, NestFactory, REQUEST } from '@nestjs/core';
   import { describe, expect, it } from 'vitest';
   import { AppModule } from '../src/app.module.js';

   const allowedRequestScoped: string[] = [];

   describe('request scope', () => {
     it('has no unintended request-scoped providers or controllers', async () => {
       const app = await NestFactory.createApplicationContext(AppModule, { preview: true, logger: false });
       const requestScoped: string[] = [];
       for (const moduleRef of app.get(ModulesContainer).values()) {
         const wrappers = [...moduleRef.providers.values(), ...moduleRef.controllers.values(), ...moduleRef.injectables.values()];
         for (const wrapper of wrappers) {
           if (wrapper.token !== REQUEST && !wrapper.isDependencyTreeStatic()) {
             requestScoped.push(`${moduleRef.name}.${wrapper.name}`);
           }
         }
       }
       await app.close();
       expect(requestScoped.filter((name) => !allowedRequestScoped.includes(name))).toEqual([]);
     });
   });
   ```

   Run it once before the change to see the chain it reports, then again after.
2. Prove that the store does not mix requests.
   Send 20 concurrent requests with different `x-request-id` headers to an endpoint that awaits I/O, and check that each log line or response carries its own id.

   ```bash
   for i in $(seq 1 20); do curl -s -H "x-request-id: req-$i" http://localhost:3000/orders > /dev/null & done; wait
   ```

3. Start with `NEST_DEBUG=1` again and check that `introspected as request-scoped` no longer lists the chain, and that no `Cannot register cron job` warning appears.
4. Run the project's unit and e2e tests and the build.

## Gotchas

- `@nestjs/schedule` does not register `@Cron()`, `@Interval()` or `@Timeout()` in a class whose tree is request-scoped.
  It only logs a warning such as `Cannot register cron job "OrdersService@tick" because it is defined in a non static provider.`, and the job never runs.
- Nest skips `onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy`, `beforeApplicationShutdown` and `onApplicationShutdown` for request-scoped classes, so a pool that opens or closes there never does.
- `app.get(OrdersService)` throws `InvalidClassScopeException` ("is marked as a scoped provider") once the class is in a chain; use `resolve()` or remove the chain.
- `@nestjs/core` 12.1.3 and later refuse to start when an `APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE` or `APP_FILTER` registered as a singleton depends on a request-scoped class.
  Older versions ran it with `undefined` dependencies, or dropped it without a word.
- In a request-scoped BullMQ processor, `REQUEST` is the job, not an HTTP request, so `request.headers` is `undefined`.
  `@nestjs/bullmq` also ignores `@OnWorkerEvent()` listeners on request-scoped processors.
- Call `als.run(store, next)` around `next`, as in the middleware above.
  `enterWith()` keeps the store for the rest of the current async path, beyond the code you meant to cover.
- `NEST_DEBUG` also prints every dependency lookup, so filter its output.

## Related skills

- `nestjs-observability`: the request id from the store belongs on every log line and trace.
- `nestjs-scheduled-jobs`: a cron in a request-scoped chain never runs, and jobs need their own context.
- `nestjs-graceful-shutdown`: shutdown hooks are skipped for request-scoped classes.
- `nestjs-auth-deny-by-default`: the guard that sets the user id in the store, and global guards that must stay singletons.
- `nestjs-connection-pool`: per-tenant connections multiply the pool math.
