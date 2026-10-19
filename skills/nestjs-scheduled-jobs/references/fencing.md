# Fencing writes from a job

Read this when a locked job writes data that a stale run must not overwrite, for example stock counts, balances or a status that later runs move forward.

A lease cannot stop a holder that is paused.
Instance A reads the counts, then stalls in a long GC pause or behind a network partition.
Its lease expires, instance B takes the job over, reads fresher counts and writes them.
Then A wakes up and writes its stale counts over B's.
A's `signal` aborts at its next renewal, but a write already on its way still goes through.

The fencing token closes that gap.
Every acquisition of a key gets a token greater than every token the key had before.
The row keeps the highest token that wrote it and refuses a lower one, in the same statement.

Add the column with a migration:

```sql
ALTER TABLE "product" ADD COLUMN "stockFencingToken" bigint NOT NULL DEFAULT 0;
```

Then read the token and the signal from `LocksContext`.
`@nestjs/schedule` calls the job without arguments, so the context carries both through `AsyncLocalStorage` to every service the job calls.

```typescript
import { Injectable } from '@nestjs/common';
import { LocksContext, OnOneInstance, WithoutOverlapping } from '@nestjs/locks';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity.js';
import { WarehouseClient } from './warehouse.client.js';

@Injectable()
export class StockReconciliationJob {
  constructor(
    private readonly warehouse: WarehouseClient,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly locksContext: LocksContext,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  @OnOneInstance({ key: 'inventory:stock-reconciliation' })
  @WithoutOverlapping()
  async reconcile() {
    const { signal, fencingToken } = this.locksContext;
    const counts = await this.warehouse.stockCounts({ signal });
    for (const { productId, count } of counts) {
      // A run that paused past its lease has a lower token than the run that took over.
      await this.products
        .createQueryBuilder()
        .update()
        .set({ inStock: count, stockFencingToken: fencingToken })
        .where('id = :id AND "stockFencingToken" <= :token', { id: productId, token: fencingToken })
        .execute();
    }
  }
}
```

- The token belongs to the run lock of `@WithoutOverlapping()`, and it is new and higher for every run.
  With `@OnOneInstance()` alone, it is the lease's token, which stays the same while one instance owns the job.
- The `signal` aborts with a `LockLostError` when the run lock or the lease is lost (`detectedBy` is `renewal` or `deadline`).
  Pass it to `fetch`, the database driver and HTTP clients; a job that ignores it keeps running.
- Count the refused writes (`affected === 0`) and log them: they mean another instance ran the same job at the same time.
- Alert on the `lock-lost` event from `LocksEvents.events$`, or on the `nestjs:locks:lock-lost` diagnostics channel.

## Prove it

Write two rows through the fenced statement, the second with a lower token, and check that the second changes nothing:

```typescript
import { DataSource } from 'typeorm';
import { expect, it } from 'vitest';
import { Product } from '../src/inventory/product.entity.js';

it('refuses a stock write with a lower fencing token', async () => {
  const dataSource = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, entities: [Product] }).initialize();
  const products = dataSource.getRepository(Product);
  await products.save({ id: 'salmon-kibble', inStock: 0, stockFencingToken: 0 });
  const write = (count: number, token: number) =>
    products
      .createQueryBuilder()
      .update()
      .set({ inStock: count, stockFencingToken: token })
      .where('id = :id AND "stockFencingToken" <= :token', { id: 'salmon-kibble', token })
      .execute();

  expect((await write(9, 10)).affected).toBe(1);
  expect((await write(12, 7)).affected).toBe(0);
  expect((await products.findOneByOrFail({ id: 'salmon-kibble' })).inStock).toBe(9);
  await dataSource.destroy();
});
```

To reproduce the whole pause, the docs at https://docs.nestjs.com/reliability/locks run two instances, one on a `ManualLockClock` from `@nestjs/locks` that never advances, so it stops renewing like a paused process.
