---
name: nestjs-observability
license: MIT
description: Makes a NestJS app observable in production - structured JSON logs from ConsoleLogger (json, NEST_LOG_LEVEL, structured params, redact) with a trace id on every line (nestjs-cls request id, OpenTelemetry, or NestJS Observe), liveness without dependencies and readiness with @nestjs/terminus (HealthCheckService, TypeOrmHealthIndicator pingCheck, Kubernetes livenessProbe and readinessProbe), per-route latency and error rates, traces, error grouping with alerts, and BullMQ job and cron visibility (@OnWorkerEvent). Compares a vendor-neutral path (OpenTelemetry or what the project already uses) with NestJS Observe (@nestjs/observe, a paid SaaS with a free tier), and asks before adding any service that needs an account. Use when logs are plain text or console.log, a /health endpoint pings the database for liveness, pods restart when the database blips, you add monitoring, APM, tracing or error tracking, or you cannot tell which route or job is slow. Also use when preparing a NestJS app for production or a deploy.
---

# Logs, health checks and monitoring

The other production checks prevent known failures, and this one lets you see the rest.
Logs must be machine-readable, at production levels, with a trace id that ties each line to its request.
Health checks must tell "this process is stuck" (liveness) apart from "this pod should not get traffic" (readiness).
A liveness probe that checks the database restarts every pod when the database blips, and adds a reconnect storm when it comes back.
Monitoring must show per-route latency and error rates, traces, grouped errors with an alert on new ones, and jobs and cron runs.

## Check

1. Open `package.json`.
   Note the `@nestjs/common` version (JSON logs need 11, structured params 12.0, `NEST_LOG_LEVEL` and `redact` 12.2) and the `@nestjs/terminus` version.
   Note what is already in place: `nestjs-pino`, `pino`, `winston`, `nestjs-cls`, `@opentelemetry/*`, `@nestjs/observe`, `@sentry/*`, `dd-trace`, `newrelic`, `prom-client`.
   Note the HTTP platform, the queue, the package manager and the `Makefile` targets.
2. Open the deploy config: `k8s/` or Helm values (`livenessProbe`, `readinessProbe`), the `Dockerfile` (`HEALTHCHECK`), or the PaaS file (`fly.toml`, `render.yaml`, `app.yaml`).
3. Logs: open `main.ts` and read the `logger` option of `NestFactory.create()`.
   Search `src/` for `console.log(`, `console.error(`, `Scope.REQUEST`, `x-request-id`, `ClsModule`, `traceId`, `logLevels` and `NEST_LOG_LEVEL`.
4. Health: open the health controller.
   The liveness route must not touch the database, Redis, or any HTTP dependency.
   The readiness route checks the database with a timeout shorter than the probe's `timeoutSeconds`, and no third-party API.
5. Monitoring: for each of per-route latency and error rate, traces, error grouping with an alert, and job and cron visibility, write down what provides it or "missing".

Pass: production logs are one JSON object per line at `log` level and above, each request's lines carry the same trace id, liveness has no dependencies, readiness checks the database, and all four monitoring needs are covered or the user has decided on them.

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
    redact: ['authorization', 'password', 'paymentMethodId'],
  }),
});
```

Set `NEST_LOG_LEVEL=log` in the production environment (the Kubernetes `env`, the PaaS config), so `debug` and `verbose` lines stay out.
Before `@nestjs/common` 12.2, pass `logLevels: ['log', 'warn', 'error', 'fatal']` instead, and drop `redact`.

Log with a message and a plain object, which becomes structured `params` (12.0 and later):

```ts
this.logger.log('Order paid', { orderId: order.id });
this.logger.error(error, { orderId: order.id });
```

An `Error` as the message lands in an `error` field with its stack.
Replace every `console.log` with a `Logger`, and remove any log of the config object (`nestjs-config-validation`).

### 2. Put a trace id on every line

Use the id of the tracer the project already has.
With NestJS Observe it is automatic (`attachTraceIdToLogs` defaults to `true`).
With OpenTelemetry, read it from the active span (see `references/monitoring.md`).
Without a tracer, keep a request id in `AsyncLocalStorage` with `nestjs-cls` (version 7 needs Node 22):

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

You need per-route latency and error rates, traces that show which methods and queries took the time, errors grouped into defects with an alert on new ones, and visibility into jobs and cron runs.
Most of this needs a backend.
Do not sign up for a service, add credentials, or pick a paid plan yourself.
Show the user the options and ask:

- What the project already uses, configured to cover the four needs.
- OpenTelemetry, which is vendor-neutral and needs a backend you run or buy.
- NestJS Observe (`@nestjs/observe`), a hosted service for Nest with a free tier, set up with a module and one `NestFactory.create()` option.

Read `references/monitoring.md` before you set up either of the last two.

### 5. Make jobs and cron runs visible

Log the outcome of every job with its id, so a failed job is one search away:

```ts
@OnWorkerEvent('failed')
onFailed(job: Job | undefined, error: Error) {
  this.logger.error(error, { jobId: job?.id, job: job?.name, attemptsMade: job?.attemptsMade });
}
```

Put it in the `WorkerHost` class, next to `process()`.
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

## Related skills

- `nestjs-error-handling`: keep Nest's error logs and stack traces that resolve to source.
- `nestjs-request-scope`: replace request-scoped loggers with `AsyncLocalStorage`.
- `nestjs-graceful-shutdown` and `nestjs-connection-draining`: how readiness behaves while a pod stops.
- `nestjs-config-validation`: never log config values or credentials.
- `nestjs-scheduled-jobs`: job retention and retries that the job logs report on.
- `nestjs-resilience`: alert on breaker transitions and bulkhead rejections.
- `nestjs-auth-deny-by-default`: health routes must be public on purpose.
