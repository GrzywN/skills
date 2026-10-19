---
name: nestjs-http-edge-security
license: MIT
description: Hardens the HTTP edge of a NestJS app. Turns on security headers with app.useSecurityHeaders() (Nest 12.1+, helmet or @fastify/helmet fallback), replaces enableCors() with explicit origins from config, rate-limits login, payment and email endpoints with @nestjs/throttler (ThrottlerModule, ThrottlerGuard as APP_GUARD, @Throttle, @SkipThrottle) on shared Redis storage for N replicas, and sets trust proxy to the real hop count on Express or the proxy CIDRs on Fastify. Use when main.ts has app.enableCors() with no arguments, the cors option set to true, no helmet or useSecurityHeaders, no trust proxy, or ThrottlerModule with the default in-memory storage, when req.ip is always the load balancer address, when every client shares one rate limit, when secure cookies or req.protocol break behind a proxy, or when asked about CSP, HSTS, CORS, brute force or rate limiting. Also use when preparing a NestJS app for production, a deploy, or more replicas, even if the user does not name these topics.
---

# HTTP edge security

Locally the app gets requests straight from a browser on one process.
In production it sits behind a load balancer, runs as several replicas, and anyone on the internet can call it.
It needs security headers, a CORS list instead of "every origin", rate limits on the endpoints worth abusing, and the right idea of who the client is.
Without `trust proxy`, every request seems to come from the load balancer, so all clients share one rate limit and `req.protocol` is `http` even for HTTPS clients.

## Check

Open `src/main.ts` (and any `setup*.ts` it calls), the root module, `package.json`, the lockfile, and the deploy manifests (`k8s/`, `helm/`, `docker-compose*.yml`, `fly.toml`, `render.yaml`).

- [ ] Search for `useSecurityHeaders(`, `helmet(` and `@fastify/helmet`.
      Pass: one of them runs right after `NestFactory.create`.
- [ ] Run `npm ls @nestjs/core @nestjs/common` (or the project's package manager).
      `useSecurityHeaders()` exists from `@nestjs/core` 12.1.0.
      `@nestjs/common` 12.1+ already has it in the types, so a project with a newer `common` than `core` compiles and then crashes at boot with `app.useSecurityHeaders is not a function`.
- [ ] Search for `enableCors(` and `cors:` in `NestFactory.create` options.
      Fail: no arguments, `cors: true`, `origin: true`, `origin: '*'`, or `credentials: true` with a reflected origin.
      Pass: `origin` is a list read from config.
- [ ] Search for `ThrottlerModule`, `ThrottlerGuard`, `@Throttle(` and `storage:`.
      Pass: a global `ThrottlerGuard`, a tighter `@Throttle()` on sign-in, password reset, payment and anything that sends email or SMS, and shared storage when there is more than one replica.
- [ ] Search for `trust proxy` and `trustProxy`.
      Pass: Express gets a hop count number or the proxy addresses; Fastify gets the proxy IP or CIDR list.
      Fail: `true`, or nothing while the app runs behind a proxy.
- [ ] Count replicas (`replicas:`, autoscaling `maxReplicas`, PaaS instance count) and proxies in front (cloud load balancer, ingress controller, CDN).

## Apply

Detect the platform (`@nestjs/platform-express` or `@nestjs/platform-fastify`), the package manager from the lockfile, and Makefile targets.
Put the edge setup in one exported function, so `main.ts` and the e2e test configure the app the same way.

1. Security headers.
   With `@nestjs/core` 12.1.0 or later, call `app.useSecurityHeaders()` right after `NestFactory.create()`, once, before `app.init()` or `app.listen()`.
   Calling it after init, or twice, throws.
   When `core` is older than `common` (for example `core` 12.0.x with `common` 12.2), align `core` with `common` first (see `nestjs-dependency-updates`).
   When you cannot upgrade, fall back to Helmet: `app.use(helmet())` from `helmet` on Express, `await app.register(helmet)` from `@fastify/helmet` on Fastify, registered before any other `app.use()`.
   Options use Helmet's names, for example `app.useSecurityHeaders({ contentSecurityPolicy: { directives: { scriptSrc: ["'self'", 'https://cdn.example.com'] } } })`.

2. CORS from config.
   Add `CORS_ORIGINS` (comma-separated) to the config schema (see `nestjs-config-validation`) and to `.env.example`.
   Set `credentials: true` only when the frontend sends cookies.
   Ask the user for the production origins if the repository does not name them.

3. Trust proxy.
   Add `TRUST_PROXY_HOPS` to config.
   It is the number of proxies between the client and the app: one for a single cloud load balancer, two for a load balancer in front of an ingress controller.
   Read the deploy manifests; if they do not settle it, ask the user and write down the assumption.

```ts
// src/http-edge.ts
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';

export function configureHttpEdge(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  app.useSecurityHeaders();
  app.set('trust proxy', Number(config.getOrThrow<string>('TRUST_PROXY_HOPS')));
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
}
```

```ts
// src/main.ts (excerpt)
const app = await NestFactory.create<NestExpressApplication>(AppModule);
configureHttpEdge(app);
await app.listen(process.env.PORT ?? 3000);
```

   On Fastify, pass the proxy addresses to the adapter: `new FastifyAdapter({ trustProxy: ['10.0.0.0/8'] })`, with the list from config.
   Fastify 5.12.1 and later ignore a number here (hop-count trust is disabled and trusts nothing), so a hop count does not work there.

4. Rate limits.
   Install `@nestjs/throttler` (checked: 6.7.1, peers include Nest 12).
   Register it globally with a generous default and tighten the sensitive routes.
   `ttl` is in milliseconds; use the `seconds()`, `minutes()` and `hours()` helpers.

```ts
// src/app.module.ts (excerpt)
ThrottlerModule.forRoot([{ ttl: minutes(1), limit: 100 }]),
// ...
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```

```ts
// src/orders/orders.controller.ts (excerpt)
@Throttle({ default: { limit: 5, ttl: minutes(1) } })
@Post(':id/pay')
pay(@Param('id') id: string, @Body() dto: PayOrderDto) {
  return this.orders.pay(id, dto);
}
```

   Put `@SkipThrottle()` on the health controller, so probes never get a 429.
   Register `ThrottlerGuard` before the auth guard (see `nestjs-auth-deny-by-default`).

5. Shared storage for more than one replica.
   The default storage counts in each process's memory, so with N replicas a client gets N times the limit, and every deploy resets the counts.
   Reuse the Redis the project already has (`REDIS_URL`, BullMQ, cache).
   If there is none, ask the user before adding one; do not sign up for a hosted Redis yourself.
   `@nestjs-redis/throttler-storage` (2.0.1, published September 2026, peers include Nest 12, ESM, needs the `redis` client 5 or 6) implements `ThrottlerStorage` with atomic Lua scripts.
   The storage the Nest docs link to, `@nest-lab/throttler-storage-redis` (ioredis), lists only Nest 7 to 11 as peers in 1.2.0, so it fails a clean install on Nest 12; use it only on Nest 11 or after its peer range includes 12.

```ts
// src/throttler/throttler-redis.ts
import { Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class ThrottlerRedis implements OnApplicationShutdown {
  readonly client: RedisClientType;
  private readonly logger = new Logger(ThrottlerRedis.name);

  constructor(config: ConfigService) {
    this.client = createClient({
      url: config.getOrThrow<string>('REDIS_URL'),
      disableOfflineQueue: true,
    });
    // Without a listener, a dropped connection crashes the process.
    this.client.on('error', (error: Error) => this.logger.warn(`Redis: ${error.message}`));
  }

  connect() {
    return this.client.connect();
  }

  async onApplicationShutdown() {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }
}

@Module({ providers: [ThrottlerRedis], exports: [ThrottlerRedis] })
export class ThrottlerRedisModule {}
```

```ts
// src/app.module.ts (excerpt)
ThrottlerModule.forRootAsync({
  imports: [ThrottlerRedisModule],
  inject: [ThrottlerRedis],
  useFactory: async (redis: ThrottlerRedis) => {
    await redis.connect();
    return {
      throttlers: [{ ttl: minutes(1), limit: 100 }],
      storage: new RedisThrottlerStorage(redis.client),
    };
  },
}),
```

   If shared storage is not possible yet, divide the limits by the maximum replica count and say so in the response; it is a stopgap, because the load balancer does not spread one client evenly.

## Verify

Run an e2e test that starts the real `AppModule` twice, configured with the same `configureHttpEdge()`, against the e2e Redis.
Two instances in one test stand in for two replicas.

```ts
// test/http-edge.e2e-spec.ts (excerpt; set TRUST_PROXY_HOPS=1 and CORS_ORIGINS for the run)
it('counts one client across replicas, whatever it puts in X-Forwarded-For', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const response = await fetch(`${urls[i % 2]}/orders/1/pay`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.0.0.${i}, 203.0.113.7` },
    });
    statuses.push(response.status);
  }
  expect(statuses.at(-1)).toBe(429);
});
```

- With `limit: 5` on the route, the sixth request gets 429 although it went to the other instance and claimed another client IP.
  It fails with in-memory storage (counts split per instance) and with `trust proxy` set to `true` (the client picks its own IP).
  If the auth guard runs before the throttler, the requests stop at 401; send a valid token or fix the guard order.
- Headers: `curl -sI localhost:3000/health` shows `content-security-policy`, `strict-transport-security`, `x-content-type-options: nosniff`, and no `x-powered-by`.
- CORS: `curl -sI -H 'Origin: https://evil.example' localhost:3000/health` has no `access-control-allow-origin`; a listed origin gets itself back.
- Outage: stop Redis while the app runs, and confirm the app stays up and throttled routes answer fast instead of hanging.
- Boot the built app once (`node dist/main.js` or the Makefile target) to catch a `useSecurityHeaders` crash that type checks miss.

## Gotchas

- `useSecurityHeaders()` registers its hook where you call it on Express: middleware added with `app.use()` earlier runs first, and responses it ends itself carry no headers.
- The default CSP applies to Swagger UI too; its `upgrade-insecure-requests` breaks Swagger UI served over plain HTTP outside localhost.
- A route can override one header with `@Header()`.
  On Fastify, `reply.removeHeader()` cannot remove a header set by `useSecurityHeaders()`.
- `enableCors()` with no options allows every origin.
  On Fastify the default allowed methods are only `GET,HEAD,POST`, so list `methods` if the frontend sends `PUT`, `PATCH` or `DELETE`.
- With cookie auth and `credentials: true`, also consider `app.enableCsrfProtection()` (Nest 12.1+).
- `app.set('trust proxy', '1')` with a string does not mean one hop: Express reads a string as an address list, so nothing is trusted.
  Pass a number.
- `trust proxy` `true` trusts the whole `X-Forwarded-For` header, so any client can choose its IP and escape the limit.
  A hop count trusts whatever connects to the app directly; if pods are reachable without the load balancer, prefer the load balancer's CIDR.
- Do not override `getTracker()` with `req.ips[0]`: with `trust proxy` `true` it is the address the client wrote.
  Keep the default `req.ip`, or track by account where the body names one.
- With Redis storage, a Redis outage makes `ThrottlerGuard` throw, so throttled routes answer 500; health stays up only with `@SkipThrottle()`.
  `disableOfflineQueue: true` makes them fail fast instead of hanging.
  Failing open is a product decision; see `nestjs-resilience`.

## Related skills

- `nestjs-auth-deny-by-default`: guard order, so guessed tokens count against the limit.
- `nestjs-config-validation`: `CORS_ORIGINS`, `TRUST_PROXY_HOPS` and `REDIS_URL` validated at boot.
- `nestjs-dependency-updates`: aligning `@nestjs/core` with `@nestjs/common` to get `useSecurityHeaders()`.
- `nestjs-scheduled-jobs` and `nestjs-idempotent-writes`: the same shared Redis, for locks and idempotency keys.
- `nestjs-resilience`: what to do when the shared store is down.
- `nestjs-response-serialization`: keeping Swagger off the public edge.
