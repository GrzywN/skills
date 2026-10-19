# End-to-end test for an idempotent endpoint

Read this when you verify `@Idempotent()` on a real endpoint.
The test boots the real `AppModule` on the project's Postgres and Redis (docker compose or testcontainers), with the real idempotency store.
It replaces only the payment provider, at the `fetch` boundary, and counts the calls that reach it.
It was run against the orders fixture after the changes in `SKILL.md`, with `@nestjs/idempotency` 0.0.2.

Adapt three things to the project:

- How the test gets a token: here it signs one with the app's own `JwtService`, so `JWT_SECRET` must be set in the test environment.
- How it creates the resource: here it saves an `Order` through the repository.
- What it counts: here the calls to `https://api.stripe.com/`.
  Count by URL, because other code in the app (a BullMQ worker, for example) may call `fetch` too.

If the provider client is an injected class, override that provider with a fake instead of spying on `fetch`.

```typescript
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { setTimeout } from 'node:timers/promises';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { Order } from '../src/orders/order.entity.js';

let app: INestApplication;
let token: string;
let orders: Repository<Order>;
let stripeCalls = 0;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  token = await app.get(JwtService).signAsync({ sub: 'usr_alice' });
  orders = app.get(getRepositoryToken(Order));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).startsWith('https://api.stripe.com/')) {
      stripeCalls++;
      // Slow enough for two concurrent requests to overlap.
      await setTimeout(200);
    }
    return Response.json({ id: `pi_${stripeCalls}` });
  });
});

afterAll(() => app.close());

beforeEach(() => {
  stripeCalls = 0;
});

const newOrder = () =>
  orders.save(orders.create({ customerId: 'usr_alice', customerEmail: 'alice@example.com', totalCents: 4098 }));

const pay = (orderId: string, key?: string, paymentMethodId = 'pm_card_visa') => {
  const call = request(app.getHttpServer())
    .post(`/orders/${orderId}/pay`)
    .set('Authorization', `Bearer ${token}`)
    .send({ paymentMethodId });
  return key ? call.set('Idempotency-Key', key) : call;
};

it('POST /orders/:id/pay without a key is a 400', async () => {
  const order = await newOrder();
  const response = await pay(order.id).expect(400);
  expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  expect(stripeCalls).toBe(0);
});

it('POST /orders/:id/pay retried with the same key charges once and replays', async () => {
  const order = await newOrder();
  const key = crypto.randomUUID();
  const first = await pay(order.id, key).expect(201);
  const retry = await pay(order.id, key).expect(201).expect('Idempotent-Replayed', 'true');
  expect(retry.body).toEqual(first.body);
  expect(stripeCalls).toBe(1);
});

it('POST /orders/:id/pay with a reused key and another body is a 422', async () => {
  const order = await newOrder();
  const key = crypto.randomUUID();
  await pay(order.id, key).expect(201);
  const reused = await pay(order.id, key, 'pm_card_mastercard').expect(422);
  expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
});

it('POST /orders/:id/pay sent twice at once runs once, the other gets a 409', async () => {
  const order = await newOrder();
  const key = crypto.randomUUID();
  const [a, b] = await Promise.all([pay(order.id, key), pay(order.id, key)]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  expect([a, b].find((response) => response.status === 409)?.headers['retry-after']).toBe('1');
  expect(stripeCalls).toBe(1);
});
```

- When `body.code` is `undefined` but the status is right, a global exception filter is rewriting the body.
  Fix the filter (see `nestjs-error-handling`); clients need `code` to tell `IDEMPOTENCY_KEY_IN_USE` from a business 409.
- Run the suite once with `@Idempotent()` removed and watch every case fail.
- Vitest needs `unplugin-swc` for Nest decorators and their metadata; reuse the project's e2e config.
- To run without the store's table, override the store provider with `new InMemoryIdempotencyStore()` (`overrideProvider(TypeOrmIdempotencyStore).useValue(...)`): a plain instance does not register itself, so the module falls back to memory.
  Keep the real store when the database is there anyway; it is closer to production.
