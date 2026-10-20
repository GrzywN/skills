---
name: nestjs-observability
license: MIT
description: Makes a NestJS app observable in production - structured JSON logs from ConsoleLogger (json, flattenParams, NEST_LOG_LEVEL, structured params, redact) with log levels used as a contract and a trace id on every line (nestjs-cls, OpenTelemetry, or NestJS Observe), liveness without dependencies and readiness with @nestjs/terminus, per-route p95 and error rates, traces, error grouping with alerts, and BullMQ job wait time, attempts and cron visibility. Helps choose a monitoring tool - NestJS Observe, Sentry (@sentry/nestjs), Datadog, New Relic, or OpenTelemetry - and asks before adding any service that needs an account or money. Use when logs are plain text or console.log, log messages embed ids, a /health endpoint pings the database for liveness, pods restart when the database blips, you add monitoring, APM, tracing or error tracking, compare Observe, Sentry, Datadog and OpenTelemetry, or cannot tell which route or job is slow. Also use when preparing a NestJS app for production or a deploy.
---

# Logs, health checks and monitoring

The other production checks prevent known failures, and this one lets you see the rest.
Logs must be machine-readable, at production levels, with a trace id that ties each line to its request.
Health checks must tell "this process is stuck" (liveness) apart from "this pod should not get traffic" (readiness).
A liveness probe that checks the database restarts every pod when the database blips, and adds a reconnect storm when it comes back.
Monitoring must show per-route latency and error rates, traces, grouped errors with an alert on new ones, and jobs and cron runs.

Add the signals in this order, because each one makes the next more useful:

1. Health checks, kept out of every other signal.
2. JSON logs at production levels, with structured params.
3. Traces and error tracking together, from one instrumentation, which also puts the trace id on every log line.
4. Alerts on error rate and p95, after about a week of data to set thresholds against.
5. Queue monitoring, the day the project adds a queue.

## Check

1. Open `package.json`.
   Note the `@nestjs/common` version (JSON logs need 11, structured params 12.0, `NEST_LOG_LEVEL` and `redact` 12.2) and the `@nestjs/terminus` version.
   Note what is already in place: `nestjs-pino`, `pino`, `winston`, `nestjs-cls`, `@opentelemetry/*`, `@nestjs/observe`, `@sentry/*`, `dd-trace`, `newrelic`, `prom-client`.
   Note the HTTP platform, the queue, the package manager and the `Makefile` targets.
2. Open the deploy config: `k8s/` or Helm values (`livenessProbe`, `readinessProbe`), the `Dockerfile` (`HEALTHCHECK`), or the PaaS file (`fly.toml`, `render.yaml`, `app.yaml`).
3. Logs: open `main.ts` and read the `logger` option of `NestFactory.create()`.
   Search `src/` for `console.log(`, `console.error(`, `Scope.REQUEST`, `x-request-id`, `ClsModule`, `traceId`, `logLevels` and `NEST_LOG_LEVEL`.
   Check the log calls against `references/logging.md`: constant messages, data in plain objects, ids and not entities.
4. Health: open the health controller.
   The liveness route must not touch the database, Redis, or any HTTP dependency.
   The readiness route checks the database with a timeout shorter than the probe's `timeoutSeconds`, and no third-party API.
5. Monitoring: for each of per-route latency and error rate, traces, error grouping with an alert, and job and cron visibility, write down what provides it or "missing".

Pass: production logs are one JSON object per line at `log` level and above, log calls keep data in params, each request's and job's lines carry the same trace id, liveness has no dependencies, readiness checks the database, and the monitoring needs in Apply step 4 are covered or the user has decided on them.

## Apply

### 1. Log JSON at production levels

If the project already uses `nestjs-pino` or `winston`, keep it and configure JSON output, the level and the trace id there.
Otherwise use Nest's `ConsoleLogger`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { TraceIdLogger } from './common/trace-id.logger.js';

const app = await NestFactory.create(AppModule, {
  logger: new TraceIdLogger({
    json: process.env.NODE_ENV === 'production',
    flattenParams: true,
    redact: ['authorization', 'password', 'paymentMethodId'],
  }),
});
```

Set `NEST_LOG_LEVEL=log` in the production environment (the Kubernetes `env`, the PaaS config), so `debug` and `verbose` lines stay out.
Before `@nestjs/common` 12.2, pass `logLevels: ['log', 'warn', 'error', 'fatal']` instead, and drop `redact`.
`flattenParams` puts param keys at the top level of the JSON line instead of under `params`.
Keep the shape the project's log queries already use.

Log a constant message with a plain object, which becomes structured params (12.0 and later):

```ts
this.logger.log('Order paid', { orderId: order.id });
this.logger.error(error, { orderId: order.id });
```

An `Error` as the message lands in an `error` field with its stack.
Use the levels as a contract: `fatal` stops the process, `error` needs someone to act, `warn` was handled, `log` is a business event, and `debug` and `verbose` are off in production.
Read `references/logging.md` for the rules on params, and fix the existing calls that break them.
Replace every `console.log` with a `Logger`, and remove any log of the config object (`nestjs-config-validation`).

### 2. Put a trace id on every line

Use the id of the tracer the project already has, because it is also the id of the trace and the error report.
With NestJS Observe it is automatic for `ConsoleLogger` (`attachTraceIdToLogs` defaults to `true`), also in jobs, cron runs and microservice handlers.
With pino or winston and Observe, add `TracerService.currentTraceId()` yourself, for example from pino's `mixin`.
With OpenTelemetry, read it from the active span (see `references/monitoring.md`).
Without a tracer, keep a request id in `AsyncLocalStorage` with `nestjs-cls` (version 7 needs Node 22).
This covers HTTP only, because jobs, cron runs and microservice handlers do not pass through the middleware (step 5 covers jobs):

```ts
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ClsModule } from 'nestjs-cls';

ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: (req: IncomingMessage) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 64
        ? incoming
        : randomUUID();
    },
  },
}),
```

```ts
import { ConsoleLogger } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';

type JsonLogOptions = Parameters<ConsoleLogger['getJsonLogObject']>[1];

export class TraceIdLogger extends ConsoleLogger {
  protected override getJsonLogObject(message: unknown, options: JsonLogOptions) {
    const record = super.getJsonLogObject(message, options);
    const cls = ClsServiceManager.getClsService();
    return cls.isActive() ? { ...record, traceId: cls.getId() } : record;
  }
}
```

`getJsonLogObject()` exists from `@nestjs/common` 12.0.
On Nest 11, add the id through the project's logger library, or upgrade first (`nestjs-dependency-updates`).
Delete request-scoped loggers that exist only to print a request id, and use `new Logger(MyService.name)` instead, which also breaks the request-scoped chain (`nestjs-request-scope`).
To pass the id on to your other services, add an interceptor to `HttpClientModule.forRoot({ interceptors: [...] })` that sets `x-request-id` from `ClsServiceManager.getClsService().getId()` when `isActive()`.

### 3. Split liveness from readiness

```ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database').withTimeout(1_500)]);
  }
}
```

`.withTimeout()` is the `@nestjs/terminus` 12 form.
On terminus 11, write `this.db.pingCheck('database', { timeout: 1_500 })`.
Use the indicator that matches the ORM: `PrismaHealthIndicator`, `MongooseHealthIndicator`, `MikroOrmHealthIndicator`, `SequelizeHealthIndicator`.
If a global auth guard is on, mark both routes public (`nestjs-auth-deny-by-default`), and keep them out of rate limits.

Point the probes at the two routes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  periodSeconds: 5
  timeoutSeconds: 2
```

On a PaaS, use the readiness path where a failed check only stops traffic, and the liveness path where a failed check restarts the instance.

### 4. Cover monitoring, after asking the user

You need:

- Per-route p95 latency and error rate, not averages and not one global number.
  An average hides one slow request in twenty, and a global number moves when the traffic mix changes.
- Memory and event loop delay of the process.
- Traces with spans named after your code, self time per span, and queries and outbound calls as their own spans.
- Errors grouped into defects, with first-seen time and release, an alert on a new one, and handled errors (an expected 4xx) kept apart from unhandled ones.
- Jobs and cron runs, with wait time, failures, attempts, and the request that enqueued the job.

Most of this needs a backend.
Do not sign up for a service, add credentials, or pick a paid plan yourself.
Read `references/monitoring.md`, ask the user the questions in its "Choose the tool" section, and show the options that fit:

- What the project already uses, configured to cover the needs above.
- NestJS Observe (`@nestjs/observe`), a hosted service for Nest backends with a free tier.
- Sentry (`@sentry/nestjs`), strongest at error tracking and frontends.
- A full-platform APM (Datadog, New Relic, Dynatrace) for many languages and infrastructure.
- OpenTelemetry with a backend, for vendor-neutral or self-hosted telemetry.

Set alerts on error rate and p95 per route once there is about a week of data.

### 5. Make jobs and cron runs visible

Log the outcome of every job with its id, its attempt, and how long it waited for a worker:

```ts
@OnWorkerEvent('completed')
onCompleted(job: Job) {
  this.logger.log('Job completed', {
    jobId: job.id,
    job: job.name,
    attemptsMade: job.attemptsMade,
    waitMs: (job.processedOn ?? job.timestamp) - job.timestamp,
    durationMs: (job.finishedOn ?? Date.now()) - (job.processedOn ?? job.timestamp),
  });
}

@OnWorkerEvent('failed')
onFailed(job: Job | undefined, error: Error) {
  this.logger.error(error, { jobId: job?.id, job: job?.name, attemptsMade: job?.attemptsMade });
}
```

Put them in the `WorkerHost` class, next to `process()`.
A rising wait time means too few workers, and a rising `attemptsMade` often means a dependency is failing.
When the project has no tracer that links jobs to requests, add the trace id to the job data when you enqueue it, and log it from the worker, so a failed job leads back to its request.
In each `@Cron()` method, log the start, the end and the duration with the same logger.
Keep failed jobs in Redis long enough to inspect (`removeOnFail` with an age or count, see `nestjs-scheduled-jobs`).

## Verify

1. Build, then start the app the way production does, with `NODE_ENV=production NEST_LOG_LEVEL=log`, and send its output to `app.log`.
   Call a route that logs, with `curl -H 'x-request-id: check-123' ...`.
   Then run:

   ```bash
   node -e "for (const line of require('node:fs').readFileSync('app.log', 'utf8').trim().split('\n')) JSON.parse(line)"
   grep -c '"traceId":"check-123"' app.log
   grep -c '"level":"debug"' app.log
   ```

   Pass: the first command prints nothing, the second count is at least 1, and the third is 0.
2. Stop the database (`docker stop <postgres container>`, or block its port).
   Pass: `curl -i localhost:3000/health/live` answers 200 and `/health/ready` answers 503 within the probe timeout.
   Start the database again, and `/health/ready` answers 200.
   On Kubernetes, the pods turn `NotReady` and the `RESTARTS` count does not change.
3. After the user has set up the monitoring backend, send traffic, force one error, and run one job.
   Pass: the route, the error and the job appear, and the health routes do not.

## Gotchas

- Liveness that checks the database turns a database outage into restarts of every pod.
- Kubernetes probes default to `timeoutSeconds: 1`, which cuts off a 1.5 s database check.
- A third-party API in readiness takes every pod out of the load balancer when that API is down.
- Once shutdown starts, `@nestjs/terminus` answers 503 (`shutting_down`) on every check, which removes the pod from rotation during the drain (`nestjs-connection-draining`).
- In JSON mode, `ConsoleLogger` ignores `timestamp` and `prefix`.
- `redact` masks keys in params and object messages, but not text inside string messages, so never interpolate secrets into a message.
- `console.log` bypasses the logger: no JSON, no level, no trace id.
- An incoming `x-request-id` is client input.
  Limit its length, or ignore it and always generate the id.
- `nestjs-cls` mounts as middleware here.
  On Fastify, run Verify step 1, and if the id is missing, use its `guard` or `interceptor` mount instead.
- A trailing string argument to a log call is the context, not data, and with `flattenParams` a param named `message` or `level` is dropped (`references/logging.md`).
- A request id from middleware does not reach queue jobs, cron runs, or microservice handlers.
- Two agents that hook the same database driver (for example Observe next to an APM) can conflict.
  Test the combination in staging before production.

## Related skills

- `nestjs-error-handling`: keep Nest's error logs and stack traces that resolve to source.
- `nestjs-request-scope`: replace request-scoped loggers with `AsyncLocalStorage`.
- `nestjs-graceful-shutdown` and `nestjs-connection-draining`: how readiness behaves while a pod stops.
- `nestjs-config-validation`: never log config values or credentials.
- `nestjs-scheduled-jobs`: job retention and retries that the job logs report on.
- `nestjs-resilience`: alert on breaker transitions and bulkhead rejections.
- `nestjs-auth-deny-by-default`: health routes must be public on purpose.
- `nestjs-outbound-timeouts`: pass the trace or request id on to other services.
