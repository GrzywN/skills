# Lock stores

Read this when you add the shared `LockStore` for `@nestjs/locks`.
The package defines the contract and ships only `InMemoryLockStore`.
The stores below pass the package's contract suite (`lockStoreContract` with `concurrent` on) against PostgreSQL 16 and Redis 7, with `@nestjs/locks` 0.0.3, TypeORM 0.3 and ioredis 5.

Every store follows the same rules:

- `acquire(key, owner, ttl)`, `renew(key, owner, ttl)` and `release(key, owner)` are each one atomic operation.
  A read followed by a separate write lets two instances into the job.
- Expiry is measured on the store's clock (`clock_timestamp()`, Redis `PEXPIRE`), never on the app's.
- The fencing token grows with every acquisition of a key and never goes back.
- The store is a singleton provider that calls `storage.registerSource(this)` in its constructor.

## PostgreSQL with TypeORM

The migration creates the table and the sequence.
TypeORM has no entity for a sequence, so write this migration by hand and add it to the data source's `migrations`:

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Locks1790000000000 implements MigrationInterface {
  name = 'Locks1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "locks_fencing_token_seq"`);
    await queryRunner.query(`
      CREATE TABLE "locks" (
        "key" text PRIMARY KEY,
        "owner" text,
        "fencing_token" bigint NOT NULL,
        "expires_at" timestamptz NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "locks"`);
    await queryRunner.query(`DROP SEQUENCE "locks_fencing_token_seq"`);
  }
}
```

The store needs no entity.
It injects the `DataSource` that `TypeOrmModule.forRoot()` provides:

```typescript
import { Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { DataSource } from 'typeorm';

const HELD_BY = `key = $1 AND owner = $2 AND expires_at > clock_timestamp()`;

// TypeORM's query() answers a top-level UPDATE with [rows, count]; wrapped in a CTE it
// answers with the rows, like the INSERT in acquire().
const updated = (sql: string) => `WITH updated AS (${sql} RETURNING key) SELECT key FROM updated`;

@Injectable()
export class TypeOrmLockStore implements LockStore {
  constructor(
    private readonly dataSource: DataSource,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    // One statement: the token is drawn in SET, after the row is locked, and the row's
    // own token is the floor in case the sequence ever goes back (restore, failover).
    const rows: { fencing_token: string }[] = await this.dataSource.query(
      `INSERT INTO locks (key, owner, fencing_token, expires_at)
       VALUES ($1, $2, nextval('locks_fencing_token_seq'), clock_timestamp() + $3 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         owner = EXCLUDED.owner,
         fencing_token = greatest(nextval('locks_fencing_token_seq'), locks.fencing_token + 1),
         expires_at = clock_timestamp() + $3 * interval '1 millisecond'
       WHERE locks.owner IS NULL OR locks.expires_at <= clock_timestamp()
       RETURNING fencing_token`,
      [key, owner, ttl],
    );
    const [row] = rows;
    return row ? { acquired: true, fencingToken: Number(row.fencing_token) } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      updated(`UPDATE locks SET expires_at = clock_timestamp() + $3 * interval '1 millisecond' WHERE ${HELD_BY}`),
      [key, owner, ttl],
    );
    return rows.length === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    // Keep the row: the next acquire() then always takes the update path above.
    const rows: unknown[] = await this.dataSource.query(
      updated(`UPDATE locks SET owner = NULL WHERE ${HELD_BY}`),
      [key, owner],
    );
    return rows.length === 1;
  }
}
```

- `clock_timestamp()`, not `now()`: `now()` is the start of the transaction.
- `release()` keeps the row and clears the owner, so a late insert can never hand out a smaller token.
- `pg` returns `bigint` as a string, and the package refuses a string token, hence `Number()`.
- Do not use `pg_advisory_lock()`: it is bound to one pooled connection, cannot be renewed, and has no expiry and no token.

## PostgreSQL with Drizzle, Prisma or MikroORM

- Drizzle: the docs have a complete `DrizzleLockStore` on the same table at https://docs.nestjs.com/reliability/locks (section "Keep locks in your database").
- Prisma: `upsert()` has no condition on the update, so run the same SQL as the TypeORM store through `$queryRaw` (acquire) and `$executeRaw` (renew, release; it resolves the number of affected rows).
  Convert the returned token with `Number()`.
- MikroORM: run the same SQL through the connection's raw query API.

Whatever the ORM, run the contract suite below before you rely on the store.

## Redis

Use Redis only with persistence (AOF, or RDB with a short interval) and `maxmemory-policy noeviction`.
A counter that restarts at 1 hands out tokens that holders already have, and an evicted key is a lost lock.
A failover to an asynchronous replica can lose the last writes too; where fencing must survive that, keep the locks in Postgres.
BullMQ already needs `noeviction`, so a Redis that serves BullMQ is usually set up for this.

Add `ioredis` as a direct dependency, and provide one client for the app:

```typescript
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.getOrThrow<string>('REDIS_URL')),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // Runs after the locks and idempotency packages have released what they hold.
  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
```

Each method is one Lua script, which Redis runs atomically:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

const ACQUIRE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  return redis.call('INCR', KEYS[2])
end
return 0
`;

const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const FENCING_COUNTER = 'locks:fencing-token';

@Injectable()
export class RedisLockStore implements LockStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    const token = Number(await this.redis.eval(ACQUIRE, 2, this.key(key), FENCING_COUNTER, owner, ttl));
    return token > 0 ? { acquired: true, fencingToken: token } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    return (await this.redis.eval(RENEW, 1, this.key(key), owner, ttl)) === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    return (await this.redis.eval(RELEASE, 1, this.key(key), owner)) === 1;
  }

  private key(key: string) {
    return `locks:key:${key}`;
  }
}
```

The `ACQUIRE` script touches two keys, so on Redis Cluster both must hash to one slot; check this before using it on a cluster.

## Test the store

`@nestjs/locks/testing` exports the contract as plain cases for any runner.
Run it against the server you run in production, with a connection pool so the races are real.
Without `advanceTime`, the expiry cases wait in real time, about 25 seconds in total.

```typescript
import { LocksStorage } from '@nestjs/locks';
import { lockStoreContract } from '@nestjs/locks/testing';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { Locks1790000000000 } from '../src/migrations/1790000000000-Locks.js';
import { TypeOrmLockStore } from '../src/locks/typeorm-lock.store.js';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  migrations: [Locks1790000000000],
  poolSize: 20,
});

describe('TypeOrmLockStore, the LockStore contract', () => {
  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.runMigrations();
  });
  afterAll(() => dataSource.destroy());

  for (const c of lockStoreContract(() => new TypeOrmLockStore(dataSource, new LocksStorage()), { concurrent: { callers: 32 } })) {
    it(c.name, c.run, 60_000);
  }
});
```

For Redis, create several clients and hand them out in turn, so calls overlap: `lockStoreContract(() => new RedisLockStore(clients[next++ % clients.length]!, new LocksStorage()), { concurrent: true })`.
