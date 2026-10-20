# Monitoring backends

Read this before you add tracing, metrics, or error tracking.
Every option below sends data to a backend that someone runs or pays for.
Ask the user which option to use, who owns the account, and where the credentials will be stored.
Do not sign up, create keys, run a linking command, or choose a plan yourself.

## What the backend must show

- Per-route latency (p95 at least) and error rate, for HTTP and other transports.
- Memory and event loop delay of the process.
- Traces with spans named after your code (`OrdersService.create`, not `middleware - <anonymous>`), self time and not only total time, and database queries and outbound HTTP calls as their own spans with the statement visible.
- Traces that continue through a queue, so a request and the job it enqueued are one story.
- Unhandled errors grouped into defects, with the release where each first appeared and an alert when a new one appears.
  Handled errors (a thrown `NotFoundException` is the API doing its job) stay out of that error rate, or it sits at a few percent and everybody ignores it.
- Queue jobs and cron runs, with wait time before a worker picks them up, duration, failures, and the attempt that failed.

Keep health probes out of the latency numbers in every option.
A probe every few seconds is thousands of identical cheap requests a day, and it pulls the percentiles down.

## Choose the tool

Ask the user these questions, then recommend from the table.
Every option needs an account, a self-hosted backend, or both, so the user decides.

1. Is every service in the request path NestJS, or are there services in other languages that must appear in the same trace?
2. Is the main pain in the backend, or in browser or mobile errors?
3. Must telemetry stay inside your network, or must the instrumentation be vendor-neutral?
4. Is there infrastructure to watch (hosts, Kubernetes, the database server) and a team to run the tooling?
5. What does the project already use, and what is the budget?

| Situation | Recommendation |
| --- | --- |
| The project already has a tracer or error tracker | Extend it to cover the needs above (option A). |
| NestJS backend only, small team, "we only have logs" today | NestJS Observe (option C). |
| Browser or mobile errors and session replay matter, or the error workflow and its integrations are the main need | Sentry (option D), at least for the frontend. |
| Several languages in one trace, or infrastructure to watch, with budget and people | A full-platform APM (option E). |
| Data must stay in your network, or instrumentation must be portable | OpenTelemetry (option B). |

The options combine: Observe for the Nest backend with Sentry for the frontend, or Observe for the application layer with an APM for infrastructure, or Observe now and OpenTelemetry as the long-term standard.
If two of them hook the same database driver, test the combination in staging first.

The comparison behind this table comes from the post "NestJS Observe vs Sentry, Datadog and OpenTelemetry" by the NestJS team, who also build Observe and say so.
Its facts about other tools were checked against their docs in September 2026.
Check the current docs and pricing of each candidate before you recommend one.

### What each one shows inside a Nest app

- Generic Node.js agents (APMs, OpenTelemetry auto-instrumentation) patch libraries by name.
  A trace shows the HTTP server, the router, `pg.query` and the outbound call, but not your services, unless you add spans yourself.
- Sentry's Nest SDK adds spans for the request pipeline (middleware, guards, pipes, interceptors, filters, route handlers marked `@Injectable()`), but not the services behind the controller.
- Observe wraps every provider the DI container creates through `NestFactory.create()`'s `instrument` option, so each provider method is a span with self time.
  Instances created inline, such as `@UsePipes(new MyPipe())`, bypass the container and get no span.

## Option A: what the project already uses

If `package.json` already has a tracer or an error tracker (`@opentelemetry/*`, `@sentry/*`, `dd-trace`, `newrelic`, `@nestjs/observe`), extend it to the needs above before you add anything new.
Two tools that overlap cost twice and disagree.

## Option B: OpenTelemetry (vendor-neutral)

OpenTelemetry instruments the app and exports over OTLP to any backend: an OpenTelemetry Collector with Jaeger, Tempo, or Prometheus that the team runs, or a vendor's OTLP endpoint.
The backend is the part that costs money or operations time, so it is the user's decision.

Zero-code setup with `@opentelemetry/auto-instrumentations-node` (checked at 0.81.2), configured by environment variables:

```bash
OTEL_SERVICE_NAME=orders-api
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=<the endpoint the user chose>
NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
```

`--require` hooks CommonJS only.
The Nest 12 starter builds ESM, which also needs the experimental loader hook `--experimental-loader=@opentelemetry/instrumentation/hook.mjs`.
Check https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md for the current way, and confirm in Verify that spans for your controllers and queries appear.

To keep probes out, configure `@opentelemetry/instrumentation-http` with `ignoreIncomingRequestHook` in a programmatic setup, or drop those spans in the collector.

Put the trace id on log lines from the active span:

```ts
import { ConsoleLogger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

type JsonLogOptions = Parameters<ConsoleLogger['getJsonLogObject']>[1];

export class OtelTraceIdLogger extends ConsoleLogger {
  protected override getJsonLogObject(message: unknown, options: JsonLogOptions) {
    const record = super.getJsonLogObject(message, options);
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    return traceId ? { ...record, traceId } : record;
  }
}
```

OpenTelemetry records errors on spans but does not group them into defects or alert on new ones.
That is the backend's job, or a separate error tracker's, which is again the user's choice.

## Option C: NestJS Observe

NestJS Observe is a hosted monitoring service built for Nest by the Nest team.
The SDK is `@nestjs/observe` (MIT, checked at 0.3.16), and it needs `@nestjs/core` 11.1.4 or later and Node 20.19 or later, on Express or Fastify.
The service is paid, with a Free plan: 300,000 events a month, 3 days of retention, and a hard monthly limit.
Error grouping, tracing, and trace ids in `ConsoleLogger` lines are on every plan, and the Free plan emails on a new unhandled error.
Log forwarding and alert rules (email, Slack, webhook) are on paid plans, and there is no native PagerDuty or Opsgenie integration.
Read the current prices on the Observe site and give them to the user, because they change.

It instruments through Nest's DI container, so spans are your own providers and methods.
It covers HTTP, microservices, GraphQL, WebSocket gateways, BullMQ and Bull jobs, and `@nestjs/schedule` cron runs, and a BullMQ or Bull job shares a trace with the request that enqueued it (not scheduled jobs or `FlowProducer` flows).
Queries through `pg`, `mysql2` and `mongodb` (so TypeORM, Drizzle, MikroORM, Mongoose, and Prisma with the `pg` driver adapter) and outbound HTTP appear as spans, with the statement shape only.

It does not cover:

- Services in other languages, and it correlates services with a request id header, not W3C `traceparent`.
  Over microservice transports, carry the id in the payload yourself.
- Frontends, mobile apps, or infrastructure (hosts, Kubernetes, the database server).
- Prisma on its own query engine, Redis and Kafka client calls, and cloud SDK operations by name (they appear as HTTP requests).
- Self-hosting, or OTLP in or out.

Setup is a module and one application option:

```ts
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      serviceId: 'orders-api',
      enabled: process.env.NODE_ENV === 'production',
      http: { ignore: ['/health/live', '/health/ready'] },
    }),
  ],
})
export class AppModule {}
```

```ts
const app = await NestFactory.create(AppModule, { instrument: ObserveInstrument });
```

- `appKey` and `appSecret` are read from `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` when the options leave them out.
  Put them in the platform's secret store, not in the image or the repository.
  Without them, the SDK sends nothing to the hosted service and warns at startup.
- `npx @nestjs/observe link` signs in or signs up, creates a project and a key, writes them to `.env`, and edits `package.json`, `.gitignore`, the root module and `main.ts`.
  Only the user runs it, or tells you to.
- `http.ignore` takes strings, `{ method, path }` objects, RegExps, or one function of the request.
  A string matches `req.url` exactly, query string included, so `'/health'` does not match `/health/ready` or `/health?x=1`.
  List each probe path, or pass a function.
  Nothing is ignored by default.
- With Fastify, the adapter is the second argument of `NestFactory.create()`, so the options with `instrument` move to the third.
  Options passed second next to an adapter are dropped silently.
- `sourceContext` defaults to `true`: error reports carry a few lines of your source code around each frame.
  Tell the user, and set it to `false` in `createObserveModule()` if that is not acceptable.
- Trace ids are added to `ConsoleLogger` output by default, and an incoming well-formed `x-request-id` becomes the trace id.
  Outbound `fetch` calls, `@nestjs/http-client` included, carry it on as `x-request-id`.
- With pino or winston, the `ConsoleLogger` hook does not apply.
  Inject `TracerService` and add `currentTraceId()` to each line, for example from pino's `mixin`; it returns `null` outside a trace.
- `NestFactory.createMicroservice()` takes the same `instrument` option.

## Option D: Sentry

Sentry is strongest at error tracking: grouping, release health, suspect commits, source maps, an issue workflow, and integrations (GitHub, Jira, Linear, Slack, PagerDuty).
It covers browsers and mobile apps with session replay, and it can be self-hosted.
The Nest SDK is `@sentry/nestjs` (checked at 11.8.0, peers `@nestjs/core` 8 to 12).

Its setup has three parts, and the docs at https://docs.sentry.io/platforms/javascript/guides/nestjs/ give the current code:

- An instrument file that calls `Sentry.init()` and is loaded before anything else.
  With the ESM build of the Nest 12 starter, load it with Node's `--import` flag, and follow Sentry's ESM instructions.
- `SentryModule.forRoot()` from `@sentry/nestjs/setup` in the root module.
- Errors reach Sentry through a filter.
  If the project has a catch-all filter (`nestjs-error-handling` sets one up that extends `BaseExceptionFilter`), decorate its `catch()` with `@SentryExceptionCaptured()` from `@sentry/nestjs`.
  Otherwise add `SentryGlobalFilter` from `@sentry/nestjs/setup` as an `APP_FILTER`, before any other exception filter.
  `APP_FILTER` does not reach WebSocket gateways, so add `@UseFilters(new SentryGlobalFilter())` to each gateway.

It traces HTTP, common database drivers (Prisma needs an extra integration), and the Nest request pipeline.
Your services appear in traces only where you add spans.
The DSN is a credential: it goes in the secret store, and the user creates the project.

## Option E: a full-platform APM

Datadog, New Relic, Dynatrace and similar tools correlate application traces with hosts, containers, Kubernetes, database monitoring, logs, and real-user monitoring, across every language.
They fit an organization with several languages, infrastructure to watch, and a team and budget to run them.

Their Node.js agents instrument Express or Fastify, database and cache drivers, outbound calls, and some queues, but not Nest's providers.
The tracer must be loaded before the app (for Datadog, `dd-trace` with `--import` or `--require`, per its docs).
To see `OrdersService.create`, add spans yourself.
The community package `nestjs-ddtrace` wraps providers in Datadog spans, but its latest version (6.0.0) lists `@nestjs/core` 11 as a peer, so check Nest 12 support before you use it.
Pricing usually combines hosts, ingested volume, and retention, so ask the user to price their own traffic.
