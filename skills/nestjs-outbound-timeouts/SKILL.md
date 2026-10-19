---
name: nestjs-outbound-timeouts
license: MIT
description: Puts a time limit on every outbound call of a NestJS app and checks that retries fit the caller's budget. Covers fetch with AbortSignal.timeout, @nestjs/http-client (HttpClientModule.register, registerAsync and forRoot with timeout and retry, HttpTimeoutError, toHttpException), @nestjs/axios HttpModule, SDK clients such as stripe, and database statement timeouts (pg statement_timeout through TypeORM extra, Prisma with @prisma/adapter-pg, Drizzle, postgres.js, MikroORM, Mongoose maxTimeMS, mysql2). Use when code calls fetch( without a signal, a dependency hangs, requests pile up, sockets or pool connections run out, a route answers 502 or 504, you migrate from @nestjs/axios, or you size retry attempts and backoff. Also use when preparing a NestJS app for production or a deploy, even if the user does not mention timeouts.
---

# Outbound timeouts

A dependency that stops answering is worse than one that fails.
Every request that waits on it holds memory, a socket and often a database connection, and the process runs out of them before the dependency recovers.
Few clients give up on their own: Node's `fetch` waits up to 5 minutes for response headers, and `@nestjs/http-client` has no timeout until you set one.
A timeout applies per attempt, so the retries decide how long the caller really waits.

## Check

1. Open `package.json`.
   Note the versions of `@nestjs/core`, `@nestjs/http-client`, `@nestjs/axios`, the ORM, the database driver, and every SDK that calls a remote API (`stripe`, `@aws-sdk/*`, and so on).
   Note the lockfile (package manager) and the `Makefile` targets for install, build and test.
2. Search `src/` for outbound calls: `fetch(`, `HttpClient`, `HttpService`, `axios`, `got(`, `new Stripe(`.
   List each call with its dependency, HTTP method, and where it runs (request handler, queue job, cron).
3. Each `fetch(` must pass a `signal`: `AbortSignal.timeout(...)`, `AbortSignal.any([...])` that contains a timeout, or the signal of a `@nestjs/resilience` attempt that has a `timeout`.
4. Search for `HttpClientModule.register`, `HttpClientModule.registerAsync` and `HttpClientModule.forRoot`.
   Each client needs a `timeout`, on the client or in `forRoot()`.
   Note its `retry` setting, because retries are on by default.
5. Search for `HttpModule.register` from `@nestjs/axios`.
   It needs a `timeout`, because axios has none by default.
6. For each SDK, read its timeout and retry options and their defaults in the installed package.
   For example, `stripe` 23 defaults to `timeout` 80000 ms and `maxNetworkRetries` 2, so one call can wait about 4 minutes.
7. For the database, search for `statement_timeout`, `TypeOrmModule.forRoot`, `extra:`, `new Pool(`, `PrismaPg`, `drizzle(`, `postgres(`, `MikroOrmModule`, `MongooseModule.forRoot`, `maxTimeMS` and `createPool(`.
   Also search migrations for `ALTER ROLE`.
8. Write the retry budget of each call (Apply step 6) and compare it with its caller's budget: the client's timeout, the load balancer or ingress timeout, the job's lock duration.

Pass: every outbound HTTP call and every database query has a time limit, each call's worst case fits its caller's budget, and only one layer retries each call.

## Apply

### 1. Pick a budget per dependency

Start from the caller and work inwards.
Write a table like this one for the project and keep it in the pull request:

| Call | Caller's budget | Timeout per attempt | Attempts | Worst case |
| --- | --- | --- | --- | --- |
| Carrier quotes, `GET`, in checkout | 5 s | 2 s | 2 | about 4.2 s |
| Stripe payment intent, `POST` | 30 s | 10 s | 2, with an idempotency key | about 20.2 s |
| Mailer, `POST`, in a BullMQ job | job lock 30 s | 5 s | 1 (BullMQ retries the job) | 5 s |

Read the numbers from config that is validated at boot (see `nestjs-config-validation`).

### 2. Use `@nestjs/http-client` for HTTP APIs

`@nestjs/http-client` is the Promise-based replacement for the axios-based `HttpModule`.
Version 0.0.2 needs `@nestjs/common` and `@nestjs/core` 11 or 12 and Node 20.19 or later.
It is pre-1.0, so pin the exact version.
Install it with the project's package manager, for example `npm i -E @nestjs/http-client`.

Register one named client per dependency, with a timeout and an explicit retry setting:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule, type Duration } from '@nestjs/http-client';
import { ShippingController } from './shipping.controller.js';
import { ShippingService } from './shipping.service.js';

@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: 'carrier',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseUrl: config.getOrThrow<string>('CARRIER_API_URL'),
        timeout: config.get<Duration>('CARRIER_TIMEOUT', '2s'),
        retry: { attempts: 2, backoff: { maxDelay: '1s' } },
      }),
    }),
  ],
  controllers: [ShippingController],
  providers: [ShippingService],
})
export class ShippingModule {}
```

`registerAsync()` needs `imports: [ConfigModule]` unless `ConfigModule` is global.
Replace the raw `fetch` in the service, and accept a signal so a caller can cancel:

```ts
import { Injectable } from '@nestjs/common';
import { HttpClient, InjectHttpClient } from '@nestjs/http-client';

export interface Quote {
  carrier: string;
  priceCents: number;
}

@Injectable()
export class ShippingService {
  constructor(@InjectHttpClient('carrier') private readonly carrier: HttpClient) {}

  async getQuotes(orderId: string, signal?: AbortSignal): Promise<Quote[]> {
    const { data } = await this.carrier.get<Quote[]>('/quotes', { query: { orderId }, signal });
    return data;
  }
}
```

`query` and `params` are URI-encoded, which also fixes string-built URLs such as `` `${base}/quotes?orderId=${orderId}` ``.
The type argument of `get<T>()` is not checked at runtime, so validate responses from APIs you don't control.
When a `@nestjs/resilience` preset wraps this call, set `retry: false` on the client (see `nestjs-resilience`).

### 3. Answer 502 and 504, not 500

An `HttpClientError` that leaves a handler becomes a 500.
`toHttpException()` maps it: a timeout to 504, an upstream error, network error or bad JSON to 502.
It also logs every mapping to a 5xx, because Nest's exception filter does not log an `HttpException`.
Map in one filter, and catch `DOMException` too if you use `AbortSignal.timeout()` deadlines:

```ts
import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { HttpClientError, toHttpException } from '@nestjs/http-client';

@Catch(HttpClientError, DOMException)
export class HttpClientErrorFilter extends BaseExceptionFilter {
  catch(error: HttpClientError | DOMException, host: ArgumentsHost) {
    super.catch(toHttpException(error), host);
  }
}
```

Register it with `{ provide: APP_FILTER, useClass: HttpClientErrorFilter }`.
Nest checks global filters in reverse order of registration, so a catch-all `@Catch()` filter registered after this one wins and the route answers 500.
Register this filter after any catch-all filter, and confirm the 504 in Verify.
Where a specific status means something (a 404 from the upstream), catch `HttpResponseError` in the service and throw your own exception.

### 4. Retry a POST only with an idempotency key

`POST` and `PATCH` are never retried by default, because a repeat can charge a customer twice.
When the upstream supports idempotency keys, send a key that identifies the operation and opt in for that request only:

```ts
const { data } = await this.stripe.post<{ id: string }>('/v1/payment_intents', {
  body: new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    payment_method: paymentMethodId,
    confirm: 'true',
  }),
  headers: { 'idempotency-key': `pay-${orderId}-${paymentMethodId}` },
  retry: { methods: ['POST'] },
});
```

Do not set `methods: ['POST']` on the client: the list replaces the default one, so `GET` retries stop.
Keys on your own endpoints are `nestjs-idempotent-writes`.

### 5. Keep raw `fetch` only with a signal

For scripts, one-off calls, or a Nest version older than 11, pass a timeout signal and combine it with the caller's:

```ts
const timeout = AbortSignal.timeout(5_000);
const response = await fetch('https://mailer.example.com/send', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
  signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
});
```

With `@nestjs/axios`, set `timeout` (milliseconds) in `HttpModule.register()`, or migrate to `@nestjs/http-client`.

### 6. Do the retry budget math

The worst case of one call is `attempts x timeout + the waits between attempts`.
`@nestjs/http-client` defaults: 3 attempts for `GET`, `HEAD`, `OPTIONS`, `PUT` and `DELETE`, after connection errors, per-attempt timeouts and 408, 429, 500, 502, 503 and 504.
The wait before retry n is random between 0 and `200ms x 2^(n-1)`, capped by `maxDelay` (default 30 s).
A `Retry-After` header replaces the backoff, up to `maxDelay`.
So with a 5 s timeout: 3 x 5 s + 0.2 s + 0.4 s = about 15.6 s, and up to 75 s when the upstream answers 503 with `Retry-After: 30`.
Lower `backoff.maxDelay`, or put a deadline on the whole call with `signal: AbortSignal.timeout(10_000)`.

Retries multiply across layers.
A resilience retry of 2 around a client that retries 3 times makes 6 attempts, and an SDK that retries inside adds more.
Pick one layer per dependency, and set `retry: false` or `maxNetworkRetries: 0` below it.

### 7. Set SDK timeouts explicitly

Pass the SDK's timeout and retry options in its constructor, read from config.
Count the SDK's own retries in the budget.

### 8. Set a database statement timeout

`statement_timeout` makes Postgres cancel a query that runs too long, and `pg` sets no limit by default.
Pick a value above your slowest normal query and below the request budget.
With TypeORM and Postgres, pass it to the `pg` pool through `extra`, next to the existing options:

```ts
extra: {
  statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS', 5_000),
},
```

Read `references/database.md` for the full TypeORM example, for Prisma, Drizzle, postgres.js, MikroORM, Mongoose and mysql2, and for migrations and long jobs that need a longer limit.

## Verify

1. Make an upstream hang and call the real route.
   Start a server that never answers, point the app at it, and time the request:

   ```bash
   node -e "let n = 0; require('node:http').createServer(() => console.log('attempt', ++n)).listen(4010)"
   CARRIER_API_URL=http://127.0.0.1:4010 CARRIER_TIMEOUT=500ms npm run start:prod
   time curl -s -o /dev/null -w '%{http_code}\n' 'localhost:3000/shipping/quotes?orderId=1'
   ```

   Pass: the status is 504, the server prints as many attempts as you configured, and the time matches the budget table.
   Use the project's build and start targets from the `Makefile` if it has them.
2. Keep it as a test.
   Give `HttpClientModule.forRoot({ fetch })` (or the overridden client token) a stub `fetch` that only settles when its `init.signal` aborts, and assert the error and the number of calls.
   The `nestjs-resilience` skill has a full e2e example with fake timers.
3. Prove the database limit through the app's own connection.
   Run `SHOW statement_timeout` and `SELECT pg_sleep(10)` through the app's `DataSource` (or Prisma client) in an e2e test.
   Pass: the first returns your value, and the second fails with Postgres error code `57014` after that time.
4. Recompute the budget table from the final config and put it in the pull request description.

## Gotchas

- `@nestjs/http-client` has no timeout by default (`0` means none), but it does retry by default.
  A client with only `baseUrl` waits as long as undici does.
- The timeout covers each attempt, including its interceptors and reading the body.
  For `responseType: 'stream'` and `'response'` it stops when the headers arrive.
- A `Retry-After` longer than `maxDelay` is not waited out: the 429 or 503 is returned at once.
- A request whose body is a stream is never retried, because the first attempt consumed it.
- An `AbortSignal.timeout()` deadline rejects with a `DOMException` named `TimeoutError`, not an `HttpClientError`.
- A cancelled request rejects with the signal's `reason` and is never retried.
- A client with a `baseUrl` refuses requests and redirects to another origin, so a URL taken from user input cannot receive its credentials.
- `toHttpException()` hides the upstream body by default.
  Use `forward: [422]` only for statuses whose body the caller needs.
- `pg`'s `query_timeout` only stops the client from waiting, while the query keeps running on the server.
  Use `statement_timeout`, and see `references/database.md` for the other database traps.
- A hanging query holds a pool connection for the whole wait, so a missing statement timeout also breaks the pool math in `nestjs-connection-pool`.

## Related skills

- `nestjs-resilience`: circuit breakers, bulkheads and fallbacks for dependencies that stay down, and the rule that one layer owns retries.
- `nestjs-idempotent-writes`: idempotency keys for writes that may be repeated.
- `nestjs-config-validation`: validate the timeout values at boot.
- `nestjs-connection-pool`: a slow query occupies a connection until its timeout.
- `nestjs-error-handling`: keep 502 and 504 logged and the default exception semantics.
- `nestjs-graceful-shutdown`: the shutdown budget must cover the longest outbound call in flight.
- `nestjs-migrations`: add `ALTER ROLE ... SET statement_timeout` as a reviewed migration.
- `nestjs-observability`: per-dependency latency and error rates show which timeout is too tight.
