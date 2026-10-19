---
name: nestjs-error-handling
license: MIT
description: Keeps NestJS error handling production-safe - real statuses for HttpException, an opaque 500 plus an ExceptionsHandler log line with the stack for everything else, custom response shapes through a filter that extends BaseExceptionFilter and delegates with super.catch(), unhandled promise rejections and uncaught exceptions logged with their stack before the process exits (uncaughtExceptionMonitor, not an unhandledRejection listener that keeps a broken process alive), and stack traces mapped to .ts files with --enable-source-maps and sourceMap in tsconfig. Covers @Catch(), ExceptionFilter, APP_FILTER, useGlobalFilters, HttpAdapterHost, Express and Fastify. Use when a filter is written from scratch, errors are missing from the logs, every error turns into a 500 (also a 413 from the body parser), error messages leak SQL or internals to clients, stack traces point at dist/*.js, or the process crashes without a useful log, also when preparing a NestJS app for production or a deploy.
---

# NestJS error handling

Nest's default exception layer already does the right thing: an `HttpException` keeps its status, and anything else becomes an opaque 500 with a log line from `ExceptionsHandler`.
A catch-all filter written from scratch loses both, so unknown errors stop showing up in the logs and their messages reach clients.
Errors outside request handlers crash the process, which is correct, but only useful if the stack is logged first.
Stack traces from `dist/*.js` waste time in an incident; source maps make them point at `.ts` lines.

## Check

1. Search `src/` for `@Catch(`, `implements ExceptionFilter`, `extends BaseExceptionFilter`, `useGlobalFilters(`, `APP_FILTER`, and `@UseFilters(`.
   - Pass: every filter that catches more than one known exception type extends `BaseExceptionFilter` and calls `super.catch(exception, host)` for each exception that is not an `HttpException`.
   - Fail: a filter writes `response.status(...).json(...)` for unknown errors, sends `exception.message` of a non-`HttpException` to the client, or never logs.
   - Fail: a filter that extends `BaseExceptionFilter` is created with `new` and no HTTP adapter (`useGlobalFilters(new AllExceptionsFilter())`, `@UseFilters(new X())`).
2. Search for `new InternalServerErrorException(` and other 5xx `HttpException`s that wrap a caught error.
   They produce a 500 with no log line (see Gotchas).
3. Search the whole repo (also `Dockerfile`, manifests, `package.json` scripts) for `unhandledRejection`, `uncaughtException`, `--unhandled-rejections`, and `process.exit(`.
   - Pass: no listener keeps the process running after an unhandled rejection, and fatal errors are logged through the app logger with the stack.
   - Fail: `process.on('unhandledRejection', ...)` that only logs, or `--unhandled-rejections=warn` or `=none`.
4. Open `tsconfig.json` and `tsconfig.build.json`.
   Pass: `"sourceMap": true` (or `inlineSourceMap`), not turned off in the build config.
5. Open the `Dockerfile`, `.dockerignore`, and the deploy manifests.
   Pass: `node` starts with `--enable-source-maps` (in `CMD` or `NODE_OPTIONS`), `dist/**/*.js.map` is copied into the runtime image, and `.dockerignore` does not exclude `*.map`.

## Apply

1. Decide whether a custom response shape is needed.
   If no client depends on it, delete the catch-all filter and its registration: the default layer is the correct behaviour.
   If clients depend on it, ask the user before you change the shape, and keep it through step 2.
2. Rewrite the catch-all filter so it only reshapes `HttpException` and delegates everything else.
   This works on Express and Fastify, because it replies through the HTTP adapter.

   ```typescript
   import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
   import { BaseExceptionFilter } from '@nestjs/core';

   @Catch()
   export class AllExceptionsFilter extends BaseExceptionFilter {
     override catch(exception: unknown, host: ArgumentsHost) {
       if (!(exception instanceof HttpException)) {
         return super.catch(exception, host);
       }
       const adapter = this.applicationRef ?? this.httpAdapterHost?.httpAdapter;
       if (!adapter) {
         throw new Error('Register AllExceptionsFilter with APP_FILTER or pass the HTTP adapter to its constructor');
       }
       const response = host.switchToHttp().getResponse();
       if (adapter.isHeadersSent(response)) {
         return adapter.end(response);
       }
       adapter.reply(response, { success: false, error: exception.getResponse() }, exception.getStatus());
     }
   }
   ```

   `super.catch()` keeps the opaque `{ statusCode: 500, message: 'Internal server error' }` body, the `ExceptionsHandler` log line with the stack, and the real status of `http-errors` and Fastify errors (413, 415, and so on).
   To map a known library error to a status, convert it and delegate, for example `return super.catch(new NotFoundException(), host)` for TypeORM's `EntityNotFoundError`.
3. Register the filter so the base class gets the HTTP adapter.
   With `{ provide: APP_FILTER, useClass: AllExceptionsFilter }` in a module, Nest injects `HttpAdapterHost` into the base class, and nothing else is needed.
   With `useGlobalFilters` in `main.ts`, pass the adapter:

   ```typescript
   const { httpAdapter } = app.get(HttpAdapterHost);
   app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
   ```

   For `@UseFilters()` on a controller or method, pass the class, not an instance.
4. Stop hiding causes.
   Where code catches an error and throws `InternalServerErrorException`, let the original error propagate instead, so the base filter logs it.
   If a 5xx `HttpException` must stay, log the original error with its stack before you throw, or pass it as `{ cause }` and log the cause in the filter.
5. Log fatal process errors through the app logger and keep Node's crash.
   Add `src/process-errors.ts` and call `logFatalErrors()` as the first statement in `main.ts`, before `NestFactory.create`.

   ```typescript
   import { Logger } from '@nestjs/common';

   export function logFatalErrors(logger = new Logger('Process')): void {
     process.on('uncaughtExceptionMonitor', (error, origin) => {
       logger.fatal(error);
       logger.fatal(`Process exits after ${origin}`);
     });
   }
   ```

   `uncaughtExceptionMonitor` sees unhandled rejections too (origin `unhandledRejection`, with Node's default `--unhandled-rejections=throw`) and does not change the exit.
   `Logger` writes through the logger the app sets later, so a JSON logger puts the whole stack into one entry.
   Remove any `unhandledRejection` or `uncaughtException` listener that does not exit, and any `--unhandled-rejections=warn` or `=none`.
   If the logger buffers or writes asynchronously (for example a pino destination with `sync: false`), check its docs for a flush before exit.
6. Turn on source maps.
   - Set `"sourceMap": true` in `tsconfig.json` (the Nest starter already has it).
     Nest CLI derives the SWC and Rspack source map setting from it.
   - Start Node with the flag.
     Exec-form `CMD ["node", "--enable-source-maps", "dist/main.js"]` in the `Dockerfile`, or `NODE_OPTIONS=--enable-source-maps` in the container env when the command is set elsewhere.
     If `CMD` still runs `npm run start:prod`, fix that with `nestjs-graceful-shutdown`.
   - Copy all of `dist/` into the runtime stage, `.map` files included.
7. Ask the user how repeated restarts reach someone (Kubernetes restart count, `CrashLoopBackOff`, the PaaS's crash alert), and wire that with `nestjs-observability`.
   Do not sign up for a monitoring service on your own.

## Verify

1. Add an e2e test that boots the real filter registration.
   Use the project's e2e setup and the real `AppModule` when it can start in tests; otherwise use a test module that registers the filter the same way (`APP_FILTER` or `useGlobalFilters`).
   Add a probe controller in the test file only, and pass a capturing logger with `createNestApplication({ logger })`.

   ```typescript
   it('answers an unknown error with an opaque 500 and logs it with the stack', async () => {
     const res = await request(app.getHttpServer()).get('/probe/crash').expect(500);
     expect(JSON.stringify(res.body)).not.toContain('relation');
     expect(logger.errors.flat().some((entry) => entry instanceof Error && entry.stack?.includes('relation'))).toBe(true);
   });
   ```

   Cover three cases: an `HttpException` keeps its status and shape, a plain `Error('relation "orders" does not exist')` gives a 500 without that text and one logged `Error` with a stack, and a JSON body above the app's body limit gives 413.
   Run the test against the old filter once: the last two cases must fail there.
2. Prove the crash is logged.
   Build, then run:

   ```bash
   node --enable-source-maps --input-type=module -e "import { logFatalErrors } from './dist/process-errors.js'; logFatalErrors(); Promise.reject(new Error('probe'));"
   echo "exit=$?"
   ```

   Expect a `FATAL [Process] Error: probe` entry with stack lines, then `exit=1`.
3. Prove source maps work as deployed.
   Start the built app the way production does (the container, or `node --enable-source-maps dist/main.js`), trigger an unknown error, and check that the logged stack names `src/....ts` files and lines.
   For an image, `docker inspect --format '{{json .Config.Cmd}}' <image>` must show the flag, or the manifest must set `NODE_OPTIONS`.
4. Run the project's lint, build, and test targets (Makefile first, then `package.json` scripts).

## Gotchas

- The `ExceptionsHandler` log line comes from `BaseExceptionFilter.handleUnknownError()` in `@nestjs/core`.
  Nest calls a matching custom filter first and stops there, so a filter that does not call `super.catch()` silences every unknown error.
- `BaseExceptionFilter` logs only errors that are not an `HttpException`.
  A thrown `InternalServerErrorException` or any other 5xx `HttpException` is answered without a log line.
  Subclasses of `IntrinsicException` are never logged.
- `BaseExceptionFilter` keeps the status of `http-errors` errors (Express body parser: 413 for a too-large body, 400 for bad JSON) and of Fastify errors.
  A from-scratch filter turns them into 500.
- `httpAdapterHost` is property-injected.
  A filter created with `new` and no argument has no adapter, and its first unknown error throws inside the filter.
- `BaseExceptionFilter` is for HTTP.
  For microservices use `BaseRpcExceptionFilter` from `@nestjs/microservices`, for gateways `BaseWsExceptionFilter` from `@nestjs/websockets`, and branch on `host.getType()` if one filter sees several contexts.
- A `process.on('unhandledRejection', ...)` listener replaces Node's crash: the process logs and keeps running in an unknown state.
  `uncaughtExceptionMonitor` only observes.
- Node's own crash output is plain multi-line text on stderr.
  A JSON log pipeline splits it into one entry per line, which is why the fatal log goes through the app logger.
- Node docs warn that `--enable-source-maps` adds latency when `Error.stack` is read often, and that overriding `Error.prepareStackTrace` (some APM agents do) can stop the mapping.
  Measure if the app creates many errors per request.
- `removeComments` and `declaration` in the starter tsconfig do not affect source maps.
  A `.dockerignore` entry for `*.map` or a `COPY dist/*.js` does.

## Related skills

- `nestjs-graceful-shutdown`: the exec-form `CMD` that carries `--enable-source-maps`, and the container setup.
- `nestjs-observability`: JSON logs with trace ids for these error entries, and alerts on restarts and `OOMKilled`.
- `nestjs-input-validation`: the 400 shape from `ValidationPipe` and the body limit behind the 413 test.
- `nestjs-response-serialization`: what successful responses expose; this skill covers what errors expose.
- `nestjs-resilience`: its errors reach the filter as 503 or 504 `HttpException`s with `Retry-After`; keep their status.
