---
name: nestjs-resilience
license: MIT
description: Plans for dependencies that are down in a NestJS app with @nestjs/resilience - ResilienceModule.forRoot presets per dependency, @Resilience, @CircuitBreaker, @Bulkhead, @Fallback with CircuitOpenError, @Timeout with @Signal and AbortSignal, @Retry and its idempotent rule, ResilienceService.preset().execute() in services, jobs and cron, ResilienceEvents for alerts - and makes one layer own retries across the resilience policy, @nestjs/http-client and SDKs. Use when a third-party API (carrier, payment, mailer) is slow or flaky, an outage cascades into your service, requests time out in bulk, you add a circuit breaker, bulkhead, fallback or degraded mode, you see 503 with Retry-After or 504 from these decorators, or retries multiply. Also use when preparing a NestJS app for production or a deploy, even if the user does not name resilience.
---

# Resilience for dependencies that are down

A timeout caps one call, but a dependency can be down for minutes.
Then every request still pays the full timeout, retries pile load onto a service that is already struggling, and the slow calls take up every request slot.
A circuit breaker stops calling the dependency for a while, a bulkhead caps how much capacity it can hold, and a fallback answers with something useful meanwhile.
Retries multiply across layers, so exactly one layer owns them.

## Check

1. Open `package.json`.
   `@nestjs/resilience` 0.0.2 needs `@nestjs/common` and `@nestjs/core` 12.
   Note the HTTP platform (`@nestjs/platform-express` or `-fastify`), `@nestjs/http-client`, `@nestjs/idempotency`, the queue, and the package manager (lockfile).
2. List every external dependency the app calls (search `fetch(`, `HttpClient`, `HttpService`, SDK constructors) and where each call starts: a controller, a resolver, a message handler, a queue processor, or a `@Cron()`.
3. Search for `ResilienceModule.forRoot`, `@Resilience(`, `@CircuitBreaker(`, `@Bulkhead(`, `@Fallback(`, `@Retry(`, `@Signal(` and `.preset(`.
4. For each dependency, record:
   - Breaker: a `circuitBreaker` in a preset or `@CircuitBreaker()`, with a timeout next to it.
   - Bulkhead: on calls that are slow or heavy (exports, reports, slow upstreams).
   - Fallback: where a degraded answer exists (cached data, flat rates, an empty list), or an explicit decision that there is none.
   - Signal: the attempt's `AbortSignal` reaches the I/O call.
5. Count the attempts per call across layers: resilience `retry` x `@nestjs/http-client` `retry` (default 3) x SDK retries (for example `maxNetworkRetries`) x queue `attempts`.
6. Check imports: `Timeout` from `@nestjs/schedule` is a scheduling decorator, not this one.

Pass: each unreliable dependency has a breaker with a timeout, heavy or slow paths have a bulkhead, every fallback is a conscious choice, the signal is passed down, and each call has one retrying layer.

## Apply

### 1. Register one preset per dependency

Install with the project's package manager, pinned, for example `npm i -E @nestjs/resilience`.
On Nest 11 or older, upgrade first (`nestjs-dependency-updates`), or ask the user which other library to use and check its API before you write code.

```ts
import { Module } from '@nestjs/common';
import { ResilienceModule } from '@nestjs/resilience';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [
    ResilienceModule.forRoot({
      presets: {
        carrier: {
          timeout: '2s',
          retry: { attempts: 2 },
          circuitBreaker: { failureRateThreshold: 50, minimumCalls: 10, openDuration: '30s' },
          bulkhead: { maxConcurrent: 20 },
        },
        mailer: {
          timeout: '5s',
          circuitBreaker: { failureRateThreshold: 50, minimumCalls: 5, openDuration: '1m' },
        },
      },
    }),
    ShippingModule,
  ],
})
export class AppModule {}
```

The module is global, so import it once, in the root module.
A preset's breaker and bulkhead are shared under the preset's name by every route and service that uses it, because it is one dependency.
Use `ResilienceModule.forRootAsync()` to read the numbers from validated config.
Invalid durations, unknown presets and missing fallback methods fail the boot.

### 2. Decide which layer owns retries

Pick one per dependency and turn retries off everywhere else:

- The resilience preset owns retries when the call goes through a preset.
  Its breaker then records each attempt, and an open breaker stops the retries.
  Set `retry: false` on the `@nestjs/http-client` client and `0` on SDK retries below it.
- The queue owns retries for jobs (BullMQ `attempts` and `backoff`).
  Give the job's preset no `retry`.
- `@nestjs/http-client` owns retries only for calls that no preset wraps.

```ts
HttpClientModule.register({
  name: 'carrier',
  baseUrl: process.env.CARRIER_API_URL,
  timeout: '2s',
  retry: false,
}),
```

Keep the client's timeout as a backstop that is not shorter than the preset's.

### 3. Protect the route and pass the signal

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { CircuitOpenError, Fallback, Resilience, Signal } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('quotes')
  @Resilience('carrier')
  @Fallback('flatRateQuotes', { handleIf: (error) => error instanceof CircuitOpenError })
  getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shipping.getQuotes(orderId, signal);
  }

  flatRateQuotes() {
    return this.shipping.flatRateQuotes();
  }
}
```

The service passes `signal` to the client: `this.carrier.get('/quotes', { query: { orderId }, signal })`.
Without it, a timed-out attempt keeps running in the background, unseen by the bulkhead.
Code that cannot take a parameter can inject `ResilienceContext` and read `signal`.

Over HTTP, a timeout answers 504, and an open breaker answers 503 with `Retry-After`.
Here the fallback answers only while the breaker is open, so a single slow answer still gets a 504.
Without `handleIf`, a fallback replaces every error except client errors.

Settings resolve stage by stage: a decorator on the handler (`@Timeout('1.5s')`) wins over the preset for its own stage, and the preset supplies the rest.

### 4. Cap heavy routes with a bulkhead

```ts
@Get('export')
@Bulkhead({ maxConcurrent: 2, maxQueue: 3, queueTimeout: '10s' })
export() {
  return this.orders.exportCsv();
}
```

A full bulkhead answers 503 without `Retry-After`.
Defaults are `maxConcurrent` 10 and `maxQueue` 0.

### 5. Use policies in services, jobs and cron

Decorators only work on entrypoints (controllers, resolvers, gateways, message handlers).
On a provider method they do nothing, and bootstrap warns.
Inside services, create the policy once and call `execute()`:

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpClient, InjectHttpClient } from '@nestjs/http-client';
import { ResilienceService, type ResiliencePolicy } from '@nestjs/resilience';
import { Job } from 'bullmq';

@Processor('invoices')
export class InvoicesProcessor extends WorkerHost {
  private readonly mailerPolicy: ResiliencePolicy;

  constructor(
    resilience: ResilienceService,
    @InjectHttpClient('mailer') private readonly mailer: HttpClient,
  ) {
    super();
    this.mailerPolicy = resilience.preset('mailer');
  }

  async process(job: Job<{ orderId: string; to: string }>) {
    await this.mailerPolicy.execute(
      ({ signal }) =>
        this.mailer.post('/send', {
          json: { to: job.data.to, template: 'invoice', orderId: job.data.orderId },
          signal,
        }),
      { source: 'InvoicesProcessor.process' },
    );
  }
}
```

While the breaker is open, the job fails at once with `CircuitOpenError` and BullMQ retries it later with its own backoff.
A preset's retry always applies inside `execute()`, whatever the HTTP method, so only wrap calls that are safe to repeat.
For options that are not a preset, use `resilience.create(options, name)` once, in the constructor.

### 6. Retry a write only when it is safe

On HTTP, a retry runs only for `GET`, `HEAD` and `OPTIONS` (and GraphQL queries), so a preset's retry is skipped on `POST`.
Add `@Retry({ idempotent: true })` only when running the handler twice in one request is harmless, for example because the upstream deduplicates by a reference.
Pair it with `@Idempotent()` from `@nestjs/idempotency` for client retries, and import `IdempotencyModule` before `ResilienceModule`, because the first global interceptor runs outermost.

### 7. Alert on breaker transitions

```ts
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ResilienceEvents } from '@nestjs/resilience';

@Injectable()
export class ResilienceLogger implements OnModuleInit {
  private readonly logger = new Logger('Resilience');

  constructor(private readonly events: ResilienceEvents) {}

  onModuleInit() {
    this.events.events$.subscribe((event) => {
      if (event.type === 'circuit-open' || event.type === 'circuit-closed') {
        this.logger.warn(`Circuit "${event.policy}" went from ${event.from} to ${event.to}`);
      }
      if (event.type === 'bulkhead-rejected') {
        this.logger.warn(`${event.source} is at capacity`, { active: event.active, queued: event.queued });
      }
    });
  }
}
```

Add it to the root module's `providers`, and alert on these lines in your monitoring (see `nestjs-observability`).

## Verify

1. Boot the app and read the log.
   Pass: no `is inactive`, `have no effect` or `@Signal() ... is always undefined` warnings from `ResilienceModule`.
2. Run an e2e test with the real `AppModule`, the carrier's `HttpClient` overridden with a stub `fetch`, and fake timers for `setTimeout`, `clearTimeout` and `Date` only.
   Cover two cases: a hanging carrier ends in a 504 after the configured attempts with the attempt's signal aborted, and `circuitBreaker('carrier').trip()` makes the route serve the fallback without calling the carrier.
   Read `references/testing.md` for the full test before you write it.
3. Try it against a stub you control.
   Point the dependency's URL at a `node:http` server that never answers, call the route with `curl -i` until the breaker opens, and check for `503`, `Retry-After`, or the fallback body, and the `Circuit "carrier" went from closed to open` log line.

## Gotchas

- State is per process.
  With 3 replicas, each has its own breaker, `minimumCalls` counts per instance, and a bulkhead limit applies per instance.
- A breaker learns only from calls that settle.
  Give every breaker a timeout, or a hanging call is never counted and a hanging probe keeps it half-open.
- Client errors are not failures: 4xx `HttpException`s and errors with a 4xx `status` (such as `HttpResponseError`) are not retried, not recorded and not replaced by a fallback.
  408 and 429 from the dependency count like 5xx.
- Rejections (`CircuitOpenError`, `BulkheadFullError`) are never retried, and the retry wraps the breaker.
- A retry re-runs pipes, inner interceptors and the handler, but guards and middleware run once.
- On message, event and WebSocket handlers, only a `@Retry()` on the handler itself retries.
- In a hybrid app, connect microservices with `inheritAppConfig: true`, or the global interceptor never reaches them.
- `mapErrors` (default `true`) also turns a `CircuitOpenError` thrown from a service inside a plain route into a 503.
- A fallback must not call the dependency it replaces, and it does not apply once the response was committed (streams, SSE).
- The post says `@Retry()` needs both `@Idempotent()` and `idempotent: true` on unsafe methods.
  The package only checks `idempotent: true`; `@Idempotent()` is the separate guard against client retries, and you want both.

## Related skills

- `nestjs-outbound-timeouts`: per-attempt timeouts on every client, statement timeouts, and the retry budget table this skill relies on.
- `nestjs-idempotent-writes`: `@Idempotent()` and its shared store, required before retrying writes.
- `nestjs-scheduled-jobs`: BullMQ `attempts` and `backoff` when the queue owns retries.
- `nestjs-observability`: alerts on breaker transitions and per-dependency error rates.
- `nestjs-dependency-updates`: the Nest 12 upgrade this package needs.
- `nestjs-error-handling`: keep the 503 and 504 responses logged and their shape intact.
