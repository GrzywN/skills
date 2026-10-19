# Idempotency stores

Read this when you add the shared `IdempotencyStore` for `@nestjs/idempotency`.
The package defines the contract and ships only `InMemoryIdempotencyStore`.
The stores below pass the package's contract suite (`idempotencyStoreContract` with `concurrent` on) against PostgreSQL 16 and Redis 7, with `@nestjs/idempotency` 0.0.2, TypeORM 0.3 and ioredis 5.

The rules every store follows:

- A record is an in-flight lock (it has an `owner`, and expires `lockTtl` after it was taken or extended) or a completed record (it has a `response`, no owner, and expires `ttl` after `complete()`).
- `acquire()` is atomic: of any number of concurrent calls for a free or expired key, exactly one wins, and the others get the winner's record.
- `complete()`, `release()` and `extend()` are each one compare-and-set on `owner` and expiry.
- An expired record does not exist for any method, deleted or not.
- The store is a singleton provider that calls `storage.registerSource(this)` in its constructor.

## PostgreSQL with TypeORM

The migration:

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IdempotencyKeys1790000000001 implements MigrationInterface {
  name = 'IdempotencyKeys1790000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // json, not jsonb: jsonb rejects "\u0000" inside strings, and a response body can hold one.
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "key_hash" text PRIMARY KEY,
        "key" text NOT NULL,
        "fingerprint" text NOT NULL,
        "owner" text,
        "response" json,
        "expires_at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" ("expires_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
```

The store needs no entity, and measures expiry on the database's clock:

```typescript
import { Injectable } from '@nestjs/common';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

const OWNED_BY = `key_hash = $1 AND owner = $2 AND expires_at > clock_timestamp()`;

// TypeORM's query() answers a top-level UPDATE or DELETE with [rows, count]; wrapped in a
// CTE it answers with the rows.
const changed = (sql: string) => `WITH changed AS (${sql} RETURNING key_hash) SELECT key_hash FROM changed`;

interface RecordRow {
  fingerprint: string;
  response: IdempotencyStoredPayload | null;
}

@Injectable()
export class TypeOrmIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly dataSource: DataSource,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, fingerprint: string, lockTtl: number): Promise<IdempotencyAcquireResult> {
    const hash = hashOf(key);
    // A second round only happens when the row was released or expired between the two statements.
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken: unknown[] = await this.dataSource.query(
        `INSERT INTO idempotency_keys (key_hash, key, fingerprint, owner, response, expires_at)
         VALUES ($1, $2, $3, $4, NULL, clock_timestamp() + $5 * interval '1 millisecond')
         ON CONFLICT (key_hash) DO UPDATE SET
           fingerprint = EXCLUDED.fingerprint,
           owner = EXCLUDED.owner,
           response = NULL,
           expires_at = EXCLUDED.expires_at
         WHERE idempotency_keys.expires_at <= clock_timestamp()
         RETURNING key_hash`,
        [hash, key, fingerprint, owner, lockTtl],
      );
      if (taken.length === 1) {
        return { state: 'acquired' };
      }
      const [row]: RecordRow[] = await this.dataSource.query(
        `SELECT fingerprint, response FROM idempotency_keys
         WHERE key_hash = $1 AND expires_at > clock_timestamp()`,
        [hash],
      );
      if (row) {
        return row.response === null
          ? { state: 'in-flight', fingerprint: row.fingerprint }
          : { state: 'completed', fingerprint: row.fingerprint, response: row.response };
      }
    }
    throw new Error(`The idempotency record for "${key}" kept changing; try again`);
  }

  async complete(key: string, owner: string, response: IdempotencyStoredPayload, ttl: number): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      changed(
        `UPDATE idempotency_keys
         SET owner = NULL, response = $3::json, expires_at = clock_timestamp() + $4 * interval '1 millisecond'
         WHERE ${OWNED_BY}`,
      ),
      [hashOf(key), owner, JSON.stringify(response), ttl],
    );
    return rows.length === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      changed(`DELETE FROM idempotency_keys WHERE ${OWNED_BY}`),
      [hashOf(key), owner],
    );
    return rows.length === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      changed(`UPDATE idempotency_keys SET expires_at = clock_timestamp() + $3 * interval '1 millisecond' WHERE ${OWNED_BY}`),
      [hashOf(key), owner, lockTtl],
    );
    return rows.length === 1;
  }

  /** Deletes up to `limit` expired rows. Call it from a scheduled job. */
  async prune(limit = 1000): Promise<number> {
    const rows: unknown[] = await this.dataSource.query(
      changed(
        `DELETE FROM idempotency_keys
         WHERE key_hash IN (
           SELECT key_hash FROM idempotency_keys WHERE expires_at <= clock_timestamp() LIMIT $1
         )
         AND expires_at <= clock_timestamp()`,
      ),
      [limit],
    );
    return rows.length;
  }
}

function hashOf(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
```

- The primary key is a SHA-256 of the record key (`<scope>:<key>`, plus a suffix for GraphQL), because record keys can be longer than an index entry allows.
- `response` goes in as a JSON string with an explicit `::json` cast, so the driver never guesses its type.
- Expired rows are ignored and reused by the next request with the same key; `prune()` only reclaims space.
  Call it from an `@Interval()` job with `@OnOneInstance()` (see `nestjs-scheduled-jobs`).
- Each idempotent request adds two or three statements, plus one `UPDATE` every `lockTtl / 3` while the handler runs.

## PostgreSQL with Drizzle, Prisma or MikroORM

- Drizzle: the docs have a complete `DrizzleIdempotencyStore` at https://docs.nestjs.com/reliability/idempotency (section "Store keys in PostgreSQL").
  It measures expiry with `Date.now()`, so the instances' clocks must be in sync.
- Prisma: `upsert()` has no condition on the update, so run the same `INSERT ... ON CONFLICT ... WHERE ... RETURNING` through `$queryRaw`, and the three compare-and-set statements through `$executeRaw`, which resolves the number of affected rows.
- MikroORM: run the same SQL through the connection's raw query API.

Run the contract suite below on whatever you write.

## Redis

Records are hashes that Redis expires on its own, so no prune job is needed.
Use `maxmemory-policy noeviction`: every record has a TTL, so `volatile-*` policies evict them too, and an evicted record is a double charge.
Give each service its own key prefix when several share one Redis.
Reuse the `RedisModule` that provides an ioredis client under the `REDIS` token (`nestjs-scheduled-jobs` has one in `references/lock-stores.md`), and add `ioredis` as a direct dependency.

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

const ACQUIRE = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'state', 'in-flight', 'fp', ARGV[1], 'owner', ARGV[2])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {1}
end
local r = redis.call('HMGET', KEYS[1], 'state', 'fp', 'resp')
return {0, r[1], r[2], r[3]}
`;

const COMPLETE = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'state', 'completed', 'resp', ARGV[2])
redis.call('HDEL', KEYS[1], 'owner')
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

const RELEASE = `
if redis.call('HGET', KEYS[1], 'owner') == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const EXTEND = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

@Injectable()
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, fingerprint: string, lockTtl: number): Promise<IdempotencyAcquireResult> {
    const reply = await this.redis.eval(ACQUIRE, 1, this.key(key), fingerprint, owner, lockTtl);
    if (!Array.isArray(reply)) {
      throw new Error(`Unexpected reply from the idempotency ACQUIRE script: ${String(reply)}`);
    }
    const [won, state, storedFingerprint, response] = reply;
    if (won === 1) {
      return { state: 'acquired' };
    }
    return state === 'completed'
      ? { state: 'completed', fingerprint: String(storedFingerprint), response: JSON.parse(String(response)) }
      : { state: 'in-flight', fingerprint: String(storedFingerprint) };
  }

  async complete(key: string, owner: string, response: IdempotencyStoredPayload, ttl: number): Promise<boolean> {
    return (await this.redis.eval(COMPLETE, 1, this.key(key), owner, JSON.stringify(response), ttl)) === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    return (await this.redis.eval(RELEASE, 1, this.key(key), owner)) === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    return (await this.redis.eval(EXTEND, 1, this.key(key), owner, lockTtl)) === 1;
  }

  private key(key: string) {
    return `idem:orders-api:${key}`;
  }
}
```

Each script touches one key, so the store also works on Redis Cluster.

## Test the store

`@nestjs/idempotency/testing` exports the contract as plain cases for any runner.
Run it against the server you run in production, with a pool, so the races are real.
Without `advanceTime`, the expiry cases wait in real time, a few seconds in total.

```typescript
import { IdempotencyStorage } from '@nestjs/idempotency';
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { IdempotencyKeys1790000000001 } from '../src/migrations/1790000000001-IdempotencyKeys.js';
import { TypeOrmIdempotencyStore } from '../src/idempotency/typeorm-idempotency.store.js';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  migrations: [IdempotencyKeys1790000000001],
  poolSize: 16,
});

describe('TypeOrmIdempotencyStore, the IdempotencyStore contract', () => {
  let store: TypeOrmIdempotencyStore;

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.runMigrations();
    store = new TypeOrmIdempotencyStore(dataSource, new IdempotencyStorage());
  });
  afterAll(() => dataSource.destroy());

  for (const c of idempotencyStoreContract(() => store, { concurrent: { callers: 32 } })) {
    it(c.name, c.run);
  }
});
```

For Redis, create several clients and hand them out in turn: `idempotencyStoreContract(() => new RedisIdempotencyStore(clients[next++ % clients.length]!, new IdempotencyStorage()), { concurrent: true })`.
