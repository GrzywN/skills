---
name: nestjs-idempotent-writes
license: MIT
description: Makes NestJS write endpoints safe to retry with the Idempotency-Key header and @nestjs/idempotency. Adds IdempotencyModule.forRoot with a per-user scope, @Idempotent() with required set to true on payment and create endpoints, a shared IdempotencyStore on Postgres or Redis registered through IdempotencyStorage, ttl and lockTtl, and checks the 400, 409 (IDEMPOTENCY_KEY_IN_USE with Retry-After), 422 (IDEMPOTENCY_KEY_REUSED) and Idempotent-Replayed behaviour, storeIf for 5xx, the order of global interceptors (ResilienceModule, ClassSerializerInterceptor), exception filters that drop the error code, and CORS headers. Use when customers are charged twice, orders or emails are created twice, a user double-clicks, a mobile app or SDK retries POST after a timeout, webhooks or events arrive twice, or you touch a pay, checkout, Stripe or create endpoint. Also use when preparing a NestJS app for production or a deploy, even if the user never says "idempotency".
---

# Idempotent writes

Clients retry.
A phone on a train, a double click, a proxy or SDK that retries on timeout: each can send `POST /orders/:id/pay` twice, and the second one charges the card again.
The handler cannot tell a retry from a new request unless the client says so with an `Idempotency-Key` header.
The server then runs the operation once per key and replays the stored response to every retry.

## Check

1. List the handlers that change state: `@Post(`, `@Put(`, `@Patch(`, `@Delete(`, `@MessagePattern(`, `@EventPattern(`, GraphQL `@Mutation(`.
   Mark the ones that hurt when they run twice: payments (`stripe`, `payment_intents`, `charge`), creates (`save(`, `insert(`), emails, outbound `POST` calls, `queue.add(`.
2. Look for `@nestjs/idempotency` in `package.json` and `IdempotencyModule.forRoot` or `forRootAsync` in the root module, with a `scope`.
3. Look for `@Idempotent(` on every marked handler, with `required: true` where a missing key must be refused (money, anything a customer notices twice).
4. Look for one provider that calls `registerSource(this)` on `IdempotencyStorage`.
   No store, or `allowInMemoryStorage: true`, fails: records are lost on every deploy and are not shared between replicas.
5. Check the order of global interceptors.
   `IdempotencyModule` comes before `ResilienceModule` in `imports`, and the root module's own `providers` have no `APP_INTERCEPTOR` with `ClassSerializerInterceptor`.
6. Open the global exception filters (`@Catch()`, `APP_FILTER`, `useGlobalFilters`).
   A filter that rebuilds the body from `exception.message` drops the `code` field that clients need to tell `IDEMPOTENCY_KEY_IN_USE` from "already paid".
7. For browser clients, check `enableCors` for `Idempotency-Key` in `allowedHeaders` and `Idempotent-Replayed` and `Retry-After` in `exposedHeaders`.
8. Read the service behind each handler.
   It still checks state (an order that is not `pending` cannot be paid), and an outbound payment call sends the provider its own idempotency key.

## Apply

### 1. Install

Use the package manager of the lockfile and the Makefile target when there is one.
Install `@nestjs/idempotency`.
This skill is checked against 0.0.2, which needs `@nestjs/common` and `@nestjs/core` 11 or 12 and Node 20.19 or later.
On an older Nest, go to step 7.

### 2. Add a shared store

The package ships only `InMemoryIdempotencyStore`.
You implement `IdempotencyStore` (`acquire`, `complete`, `release`, `extend`) on Postgres or Redis.
Copy a store and its migration from `references/idempotency-stores.md`.
Use the database the app already has; a second store is one more thing to run and back up.

### 3. Register the module

```typescript
@Module({
  imports: [
    IdempotencyModule.forRoot({
      scope: (req: { user?: { sub?: string } }) => req.user?.sub,
    }),
    // ResilienceModule and modules that register APP_INTERCEPTOR come after it.
    OrdersModule,
  ],
  providers: [TypeOrmIdempotencyStore],
})
export class AppModule {}
```

- `scope` runs after guards, so `req.user` is set.
  Return the id your guard puts there: the fixture's `JwtAuthGuard` stores the JWT payload, so it is `sub`.
  Without a scope, one user who sends another user's key gets that user's stored response.
- The module is global and registers one `APP_INTERCEPTOR` that does nothing for handlers without `@Idempotent()`.
- Defaults: `header` `'Idempotency-Key'`, `ttl` `'24h'`, `lockTtl` `'60s'`, `retryAfter` `'1s'`, `maxLockHold` `'1h'`, `storeTimeout` `'10s'`, `storeIf` `status < 500`.
  Raise `ttl` above the longest time a client keeps retrying.
- Use `forRootAsync({ inject, useFactory })` when an option comes from `ConfigService`, such as `encryption: { keys }` for responses with personal or payment data.

### 4. Mark the handlers

```typescript
@Post()
@Idempotent()
create(@Body() dto: CreateOrderDto) {
  return this.orders.create(dto);
}

@Post(':id/pay')
@Idempotent({ required: true })
pay(
  @Param('id') id: string,
  @Body() dto: PayOrderDto,
  @Headers('idempotency-key') idempotencyKey: string,
  @Req() req: { user: { sub: string } },
) {
  return this.orders.pay(id, dto, `${req.user.sub}:${idempotencyKey}`);
}
```

`@Idempotent()` without `required` deduplicates when a key is sent and lets other calls through.
On a class, it covers every handler except `GET`, `HEAD` and `OPTIONS`; handler options merge over class options, and both over the module's.

### 5. Keep the state check, and pass the key on

The key deduplicates retries of one attempt.
Two taps that make two keys are two attempts, so the service still refuses an order that is already paid:

```typescript
async pay(id: string, dto: PayOrderDto, paymentKey: string) {
  const order = await this.repository.findOneByOrFail({ id });
  if (order.status !== 'pending') {
    throw new ConflictException(`Order ${id} is already ${order.status}`);
  }
  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${this.config.getOrThrow<string>('STRIPE_SECRET_KEY')}`,
      'Idempotency-Key': paymentKey,
    },
    body: new URLSearchParams({ amount: String(order.totalCents), currency: 'usd', payment_method: dto.paymentMethodId, confirm: 'true' }),
  });
  // ...mark the order paid, ideally with a conditional update on status = 'pending'
}
```

The provider key closes the one gap the default leaves: a charge that succeeds, then a 5xx (the database write fails), releases the key, and the retry charges again.
Derive it from the user and the client key, because two users can send the same key.
Where the provider has no such key, use `storeIf: (status, error) => status < 500 || error instanceof ChargeCapturedError` with an exception you throw after the charge.

### 6. Fix what is around it

- Make the global exception filter keep the body of an `HttpException`, for example by extending `BaseExceptionFilter` (see `nestjs-error-handling`).
- Add the CORS headers from Check step 7 (see `nestjs-http-edge-security`).
- With the Postgres store, call `prune()` from an `@Interval()` job guarded by `@OnOneInstance()` (see `nestjs-scheduled-jobs`).
- Register `ClassSerializerInterceptor` with `app.useGlobalInterceptors()` or in a module imported after `IdempotencyModule`.

### 7. Fallback for Nest 10 or older

Upgrade first if you can (see `nestjs-dependency-updates`).
Otherwise let the client send a request id in the body, store it in a column with a unique constraint, and insert with `ON CONFLICT (request_id) DO NOTHING`, returning the existing row on conflict.
That covers creates; payments still need the provider's idempotency key.

## Verify

1. Run the store contract suite against the real database or Redis (see `references/idempotency-stores.md`).
2. Run the e2e test in `references/e2e-test.md` against the real `AppModule`.
   It proves: no key is a 400 `IDEMPOTENCY_KEY_REQUIRED`, a retry gets `Idempotent-Replayed: true` and the payment provider is called once, the same key with another body is a 422 `IDEMPOTENCY_KEY_REUSED`, and two concurrent requests give one 201 and one 409 with `Retry-After`.
3. Against a running app with a test token:

   ```bash
   KEY=$(uuidgen)
   curl -i localhost:3000/orders/$ORDER/pay -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" --json '{"paymentMethodId":"pm_card_visa"}'
   curl -i localhost:3000/orders/$ORDER/pay -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" --json '{"paymentMethodId":"pm_card_visa"}'
   ```

   The second answer has `Idempotent-Replayed: true` and the same body.
   Use the payment provider's test mode only; do not create real charges, and ask the user for test credentials instead of creating any.
4. Read the boot log: `IdempotencyStorage: TypeOrmIdempotencyStore`, and no warning that starts with `IdempotencyInterceptor runs inside`.
5. Boot with `NODE_ENV=production` and the store provider removed: startup fails with `no IdempotencyStore is registered`.

## Gotchas

- The fingerprint hashes the scope, the method, the URL and the body.
  The same key on another URL or with another body is a 422, and that check comes first, so a changed body during an in-flight request is a 422, not a 409.
- 5xx and unknown errors are not stored: the key is released and a retry runs the handler again.
- A replayed error is rebuilt as a plain `HttpException`, so a filter that checks `instanceof` a custom exception sees the base class.
- `StreamableFile`, streams and `@Res()` without `passthrough` are not stored; the key is released with a warning.
- The whole response body is stored, with no size limit, and in plain text unless `encryption` is set.
  Turn encryption on before the first record; records written before the switch fail to open.
- A key is 1 to 255 printable ASCII characters; anything else is a 400 `IDEMPOTENCY_KEY_INVALID`.
- A `scope` that returns an object or a boolean fails the call; `undefined` means the shared namespace.
- One store per app: a second `registerSource()` throws, and so does a registration after the module has initialized.
- `APP_INTERCEPTOR` providers of the root module run outside the idempotency interceptor and see every replay.
  With `ClassSerializerInterceptor` among them the app refuses to start.
- `@Retry({ idempotent: true })` from `@nestjs/resilience` re-runs a handler inside one request; `@Idempotent()` deduplicates across requests.
  On a `POST`, `@Retry()` stays inactive, with a startup warning, unless it has `idempotent: true`.
  `@nestjs/resilience` 0.0.2 only checks that flag, not `@Idempotent()`, so the pairing is your decision.
  Retries in several layers multiply, so one layer owns them (see `nestjs-resilience`).
- With Redis, use `maxmemory-policy noeviction`; every record has a TTL, so the `volatile-*` policies evict them too.
- With Postgres, store the response as `json`, not `jsonb`, which rejects `\u0000` in strings.

## Related skills

- `nestjs-scheduled-jobs`: the same shared-store pattern, and the job that prunes expired records.
- `nestjs-resilience`: server-side retries, and the import order of the two modules.
- `nestjs-error-handling`: exception filters that keep `code` and statuses.
- `nestjs-http-edge-security`: CORS headers for `Idempotency-Key`.
- `nestjs-auth-deny-by-default`: `scope` needs the user that the guard sets.
- `nestjs-migrations`: the `idempotency_keys` table ships as a migration.
- `nestjs-connection-pool`: each idempotent request adds statements to the pool.
