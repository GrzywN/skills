# Database timeouts per ORM and driver

A query without a limit holds a pool connection for as long as it runs.
Postgres cancels a query that passes `statement_timeout`, and `pg` sets no limit by default.
Pick a value above your slowest normal query and below the request budget, and read it from validated config.

## TypeORM with Postgres

TypeORM passes `extra` to the `pg` pool:

```ts
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    autoLoadEntities: true,
    connectTimeoutMS: 5_000,
    extra: {
      statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS', 5_000),
      idle_in_transaction_session_timeout: 30_000,
    },
  }),
}),
```

Keep the project's other options as they are.
`connectTimeoutMS` becomes the pool's `connectionTimeoutMillis`, the limit for opening a connection.
`maxQueryExecutionTime` only logs slow queries, it does not stop them.

## Other stacks

| Stack | Where the timeout goes |
| --- | --- |
| `pg` `Pool` (Drizzle `node-postgres`, Kysely) | `new Pool({ connectionString, statement_timeout: 5_000 })` |
| Prisma with `@prisma/adapter-pg` | `new PrismaPg({ connectionString, statement_timeout: 5_000 })`, which takes a `pg` pool config |
| postgres.js (Drizzle `postgres-js`) | `postgres(url, { connection: { statement_timeout: 5_000 } })` |
| Prisma without a driver adapter, MikroORM, any other Postgres client | `ALTER ROLE <app role> SET statement_timeout = '5s';` in a reviewed migration |
| Mongoose or `mongodb` | `serverSelectionTimeoutMS` and `socketTimeoutMS` on connect, `.maxTimeMS(ms)` on heavy queries |
| mysql2 | the per-query `timeout` option |

The role setting works for every Postgres client, because the server applies it to each new session of that role.
Check the installed MikroORM version for a pool option before you rely on anything but the role setting.

## Traps

- `pg` has two limits.
  `statement_timeout` is enforced by the server, which cancels the query.
  `query_timeout` is enforced by the client, which stops waiting while the query keeps running on the server.
  Prefer `statement_timeout`.
- `idle_in_transaction_session_timeout` ends sessions that opened a transaction and stopped, which otherwise hold locks.
- The app's limit also hits the migration job and long reports when they use the same role.
  Run them with a role or a session that sets a longer limit, for example `SET statement_timeout = 0` at the start of a long migration.
- mysql2's `timeout` is client-side, and it destroys the connection when it fires.
- `timeoutMS` on `MongoClient` is marked experimental in `mongodb` 7.7.

## Verify

Run these through the app's own connection, in an e2e test with the real `AppModule` and a real database (for example a Testcontainers Postgres):

- `SHOW statement_timeout` returns your value.
- `SELECT pg_sleep(10)` fails after your limit with Postgres error code `57014`.
