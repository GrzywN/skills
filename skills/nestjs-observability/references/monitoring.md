# Monitoring backends

Read this before you add tracing, metrics, or error tracking.
Every option below sends data to a backend that someone runs or pays for.
Ask the user which option to use, who owns the account, and where the credentials will be stored.
Do not sign up, create keys, run a linking command, or choose a plan yourself.

## What the backend must show

- Per-route latency (p95 at least) and error rate, for HTTP and other transports.
- Traces that show which of your methods and which queries took the time.
- Unhandled errors grouped into defects, with an alert when a new one appears.
- Queue jobs and cron runs, with their duration and failures.

Keep health probes out of the latency numbers in every option.

## Option A: what the project already uses

If `package.json` already has a tracer or an error tracker (`@opentelemetry/*`, `@sentry/*`, `dd-trace`, `newrelic`, `@nestjs/observe`), extend it to the four needs above before you add anything new.
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
The SDK is `@nestjs/observe` (MIT, checked at 0.3.16), and it needs `@nestjs/core` 11.1.4 or later.
The service is paid, with a Free plan: 300,000 events a month, 3 days of retention, a hard monthly limit, and no log streaming or alerting rules (those are on paid plans).
It instruments through Nest's DI container, so spans are your own providers and methods, and it covers HTTP, microservices, GraphQL, BullMQ jobs and cron runs.

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
