---
name: nestjs-response-serialization
license: MIT
description: Controls what a NestJS API sends back. Replaces returned ORM entities (TypeORM, Prisma, Drizzle, MikroORM, Mongoose) with response DTOs and mapper functions, or with an allowlist through class-transformer @Expose and @Exclude plus a global ClassSerializerInterceptor and @SerializeOptions({ type }), or through StandardSchemaSerializerInterceptor with a Zod schema. Covers the plain-object trap (spread, raw queries, lean documents) and keeps SwaggerModule.setup (/docs, /docs-json, /docs-yaml) out of production or behind auth. Use when a controller returns repository results, when a response shows passwordHash, internalNotes, payment ids or other internal columns, when adding a column or an endpoint, or when Swagger is public. Also use when preparing a NestJS app for production, a security review, a pentest or a partner integration, also when the user does not say "serialization".
---

# NestJS response serialization

A controller that returns an ORM entity sends every column, including the ones added after the endpoint was written.
A denylist (`@Exclude()` on a few fields) fails the same way, because new columns are visible by default.
A public Swagger UI hands out a complete map of the API, and Nest guards do not protect it.
Send an explicit allowlist from every endpoint, and keep the API description away from anonymous users in production.

## Check

- [ ] Open each controller and follow each handler to the value it returns.
  Fail: it returns `repository.find(`, `findOne`, `findOneByOrFail`, `save(`, `prisma.<model>.find`, a Mongoose document or `.lean()` result, or the service method that returns one of those.
- [ ] Open the entity or model of each returned value and list the fields a client must not see: password hashes, tokens, internal notes, payment provider ids, soft-delete flags, other customers' data.
- [ ] Search `src/` for `ClassSerializerInterceptor`, `StandardSchemaSerializerInterceptor`, `SerializeOptions`, `@Exclude(`, `@Expose(`, `Response`, `toResponse`.
  Note if serialization is a denylist (`@Exclude()` on a few fields of the entity) or an allowlist (response DTO, class-level `@Exclude()` with `@Expose()` fields, or a schema).
- [ ] Search for the plain-object paths: `{ ...`, `Object.assign({}`, `getRawMany`, `getRawOne`, `query(`, `$queryRaw`, `.lean()`, `toJSON()`.
  `@Exclude()` does nothing for these values.
- [ ] Open `src/main.ts` and search for `SwaggerModule.setup`.
  Pass: it does not run in production, or the docs path is protected by middleware that also covers `<path>-json` and `<path>-yaml`.
- [ ] Open `package.json` and compare the major version of `@nestjs/swagger` with `@nestjs/common`.
  `@nestjs/swagger` 12 needs `@nestjs/common` 12, and 11 needs 11.

Pass for the whole check: every endpoint sends an allowlist, and Swagger is not reachable anonymously in production.

## Apply

Detect the package manager from the lockfile and use the Makefile targets when the project has them.

1. Pick one approach and use it for the whole API.
   - Response DTO plus a mapper function: works with every ORM and with plain objects, and the compiler checks it.
     Prefer it when the project has no serializer yet.
   - class-transformer allowlist: a response class with class-level `@Exclude()` and `@Expose()` fields, a global `ClassSerializerInterceptor`, and `@SerializeOptions({ type })` on the controller.
     Fits projects that already use class-validator.
   - Standard Schema (Zod, Valibot, ArkType): `StandardSchemaSerializerInterceptor` and `@SerializeOptions({ schema })`.
     It needs `@nestjs/common` 12.0.0 or later.
2. Response DTO plus mapper.

   ```ts
   import type { Order } from './order.entity.js';

   export class OrderResponse {
     id!: string;
     status!: string;
     totalCents!: number;
     createdAt!: Date;
   }

   export function toOrderResponse(order: Order): OrderResponse {
     return {
       id: order.id,
       status: order.status,
       totalCents: order.totalCents,
       createdAt: order.createdAt,
     };
   }
   ```

   Give each handler an explicit return type, for example `Promise<OrderResponse>` and `Promise<OrderResponse[]>`, and map in the controller or the service.
   With Swagger, put `@ApiProperty()` on the response class fields (or use the Swagger CLI plugin), so the docs show the response and not the entity.
3. class-transformer allowlist.

   ```ts
   import { Exclude, Expose } from 'class-transformer';

   @Exclude()
   export class OrderResponse {
     @Expose()
     id!: string;

     @Expose()
     status!: string;

     @Expose()
     totalCents!: number;

     @Expose()
     createdAt!: Date;
   }
   ```

   ```ts
   import { ClassSerializerInterceptor, Module } from '@nestjs/common';
   import { APP_INTERCEPTOR } from '@nestjs/core';

   @Module({
     providers: [{ provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor }],
   })
   export class AppModule {}
   ```

   With `@nestjs/idempotency`, do not put it in the root module's `providers`: it then runs outside the idempotency interceptor, and startup fails.
   Provide it as `APP_INTERCEPTOR` in a module imported after `IdempotencyModule` instead (see `nestjs-idempotent-writes`).
   Put `@SerializeOptions({ type: OrderResponse })` on the controller or the handler.
   With `type` set, the interceptor converts plain objects and entities to `OrderResponse` first, so only the `@Expose()` fields go out.
   Without `type`, only class instances are filtered, and only by their own decorators.
4. Standard Schema, on Nest 12.

   ```ts
   import { Controller, Get, Module, Param, ParseUUIDPipe, SerializeOptions, StandardSchemaSerializerInterceptor } from '@nestjs/common';
   import { APP_INTERCEPTOR } from '@nestjs/core';
   import { z } from 'zod';
   import { OrdersService } from './orders.service.js';

   export const orderResponseSchema = z.object({
     id: z.string(),
     status: z.string(),
     totalCents: z.number().int(),
     createdAt: z.date(),
   });

   @Controller('orders')
   export class OrdersController {
     constructor(private readonly orders: OrdersService) {}

     @Get(':id')
     @SerializeOptions({ schema: orderResponseSchema })
     get(@Param('id', ParseUUIDPipe) id: string) {
       return this.orders.get(id);
     }
   }

   @Module({
     controllers: [OrdersController],
     providers: [{ provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor }],
   })
   export class AppModule {}
   ```

   Use `z.object()` for response schemas: it drops unknown keys.
   `z.looseObject()` passes them through, and `z.strictObject()` turns every new column into a 500.
5. Do not register both serializer interceptors globally.
   Both read the same `@SerializeOptions()` metadata, so a mix is hard to reason about.
6. Swagger.
   Skip it in production.

   ```ts
   import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

   if (process.env.NODE_ENV !== 'production') {
     SwaggerModule.setup('docs', app, () =>
       SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('orders-api').build()),
     );
   }
   ```

   If the user wants the docs in production, put them behind middleware that runs before `SwaggerModule.setup()` and covers every path that starts with the docs path.
   This Express sample uses Basic auth, so a browser can open the UI.
   Ask the user where the credentials come from, and read them from the secret store, not from the code.

   ```ts
   import { timingSafeEqual } from 'node:crypto';
   import type { NextFunction, Request, Response } from 'express';

   export function docsBasicAuth(path: string, username: string, password: string) {
     const expected = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
     return (req: Request, res: Response, next: NextFunction) => {
       if (!req.path.startsWith(path)) {
         return next();
       }
       const given = Buffer.from(req.headers.authorization ?? '');
       if (given.length === expected.length && timingSafeEqual(given, expected)) {
         return next();
       }
       res.setHeader('WWW-Authenticate', 'Basic realm="docs"');
       res.status(401).end();
     };
   }
   ```

   Register it with `app.use(docsBasicAuth('/docs', user, password))` before `SwaggerModule.setup('docs', ...)`.
   On Fastify, run the same check in an `onRequest` hook of the Fastify instance.
7. If `@nestjs/swagger` and `@nestjs/common` majors differ, align them with `nestjs-dependency-updates` before you change Swagger code.

## Verify

1. Add an e2e test per changed endpoint that compares the exact set of keys, so a new column fails the test.

   ```ts
   it('GET /orders/:id (200) returns only the public fields', async () => {
     const response = await request(app.getHttpServer())
       .get(`/orders/${orderId}`)
       .set('authorization', `Bearer ${token}`)
       .expect(200);
     expect(Object.keys(response.body).sort()).toEqual(['createdAt', 'id', 'status', 'totalCents']);
   });
   ```

   Put it in an e2e file that builds the app from the real `AppModule`, so the `APP_INTERCEPTOR` provider runs as in production.
   `orderId` and `token` come from the seed data and the login helper the existing e2e tests use.
2. Cover the list endpoint and every write endpoint that returns a record (`POST`, `PATCH`, payment or status changes), not only `GET /:id`.
3. Build, start with `NODE_ENV=production node dist/main.js`, and check the docs paths.

   ```bash
   for p in /docs /docs-json /docs-yaml; do curl -s -o /dev/null -w "$p %{http_code}\n" http://localhost:3000$p; done
   ```

   Expect `404` for all three, or `401` without credentials when the docs stay behind auth.
4. Run the project's unit and e2e tests and the build.

## Gotchas

- `ClassSerializerInterceptor` filters a plain object only when `@SerializeOptions({ type })` is set.
  Without it, `{ ...order }` sends even the fields marked `@Exclude()` on the entity, and a raw query sends every selected column.
- With `@SerializeOptions({ type })`, keys that do not match an `@Expose()` property are dropped silently.
  A raw query that returns `total_cents` sends nothing for `totalCents`, so map column names first.
- Prisma, Drizzle, raw SQL, and Mongoose `.lean()` return plain objects, so decorators on a class never apply to them.
  Use a mapper or a schema, and select only the needed columns in the query.
- `StandardSchemaSerializerInterceptor` throws `Serialization failed: ...` when the value does not match, and the client gets a 500.
  It skips handlers without a schema, so every endpoint needs `@SerializeOptions({ schema })` or a default schema in the constructor.
- `SwaggerModule.setup('docs', ...)` also serves `/docs-json` and `/docs-yaml` by default (`raw: true`).
  `ui: false` hides only the UI.
- Swagger routes are registered on the HTTP adapter directly, so `APP_GUARD` and other Nest guards never run for them.
- An entity returned from a `save()` call is the full record too, so payment and status endpoints leak as much as `GET`.

## Related skills

- `nestjs-input-validation`: the input side of the same boundary.
- `nestjs-auth-deny-by-default`: global guards, and why they do not cover Swagger.
- `nestjs-error-handling`: error bodies must not leak internals either.
- `nestjs-dependency-updates`: matching `@nestjs/swagger` and `@nestjs/common` majors, and Nest 12 for `StandardSchemaSerializerInterceptor`.
- `nestjs-http-edge-security`: CORS and headers for the same responses.
- `nestjs-idempotent-writes`: where to register `ClassSerializerInterceptor` when `IdempotencyModule` is used.
