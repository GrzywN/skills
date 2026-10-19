---
name: nestjs-input-validation
license: MIT
description: Validates every input of a NestJS API. Registers a global ValidationPipe (whitelist, forbidNonWhitelisted, transform) for class-validator DTOs, or StandardSchemaValidationPipe with @Body({ schema }) and z.strictObject for Zod, Valibot or ArkType, as an APP_PIPE provider so e2e tests get it too. Caps list endpoints (take, limit, pageSize) with a maximum and a default, caps bulk arrays, and keeps the JSON body limit at its default instead of raising it globally with app.useBodyParser or bodyLimit. Use when a request reaches repository.save(dto) with extra fields such as role or status, when GET ?take=100000 loads a whole table, when useGlobalPipes is missing or only in main.ts, when DTOs use import type or interfaces, or when adding an endpoint, DTO or query parameter. Also use when preparing a NestJS app for production or a deploy, or reviewing it for mass assignment, over-fetching or memory spikes, also when the user does not say "validation".
---

# NestJS input validation

A handler that saves its body as-is lets a client set any column, for example `{ "role": "admin" }` or `{ "status": "paid" }`.
A `take` or `limit` parameter without a maximum, or a list endpoint without a default, lets one request load a whole table into memory.
A JSON body limit raised for every route lets one large body block the event loop for all other requests on the process.
A global pipe, bounded DTOs, and the default body limit close all three.

## Check

Run these searches in `src/` and note each hit.

- [ ] Open `src/main.ts` and every `*.module.ts`.
  Search for `useGlobalPipes`, `APP_PIPE`, `ValidationPipe`, `StandardSchemaValidationPipe`.
  Pass: one global pipe is registered as an `APP_PIPE` provider, with `whitelist: true` and `forbidNonWhitelisted: true` for `ValidationPipe`.
- [ ] Open `package.json`.
  Note `class-validator`, `class-transformer`, `zod`, `valibot`, `arktype`, and the version of `@nestjs/common`.
- [ ] In every controller, look at each `@Body(`, `@Query(`, `@Param(`.
  Pass: the parameter type is a DTO class imported as a value, or the decorator has `{ schema }`, or the parameter has a pipe such as `ParseUUIDPipe`.
  Fail: an `interface`, a `type`, `import type { ... Dto }`, `any`, `Record<`, or a Zod type without `{ schema }`.
- [ ] Search for `.save(dto)`, `.create(dto)`, `.insert(dto)`, `data: dto`, `...dto`.
  Each one is a mass assignment risk when the DTO does not reject unknown fields.
- [ ] Search for `take`, `limit`, `pageSize`, `perPage`, `.find(`, `.findMany(`, `.findAll(`.
  Pass: every list query has a maximum (`@Max(`, `.max(`) and a default, and the service never passes `undefined` as the page size.
- [ ] Search for `@IsArray(` and `z.array(` in request DTOs.
  Pass: each one has `@ArrayMaxSize(` or `.max(`.
- [ ] Search for `useBodyParser`, `bodyParser`, `limit:`, `bodyLimit`.
  Pass: no global raise.
  The defaults are 100 KB for Express JSON and urlencoded bodies, and 1 MiB (`bodyLimit: 1048576`) for Fastify.
- [ ] Open the global exception filter, if there is one (`@Catch()`, `APP_FILTER`).
  Note if it replaces the response with `exception.message`, because then clients never see which field failed.

## Apply

Detect the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`) and use the Makefile targets when the project has them.

1. Pick the pipe from the DTO style.
   - class-validator classes: `ValidationPipe`.
   - Zod, Valibot or ArkType schemas: `StandardSchemaValidationPipe`.
     It needs `@nestjs/common` 12.0.0 or later, and so does `@Body({ schema })`.
   - Both styles in one project: register both.
     `ValidationPipe` skips parameters whose type is not a class, and `StandardSchemaValidationPipe` skips parameters without a `schema`.
2. Register the pipe as an `APP_PIPE` provider in `AppModule`, and remove `app.useGlobalPipes(...)` from `main.ts` so it does not run twice.

   ```ts
   import { Module, StandardSchemaValidationPipe, ValidationPipe } from '@nestjs/common';
   import { APP_PIPE } from '@nestjs/core';

   @Module({
     providers: [
       {
         provide: APP_PIPE,
         useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
       },
       { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
     ],
   })
   export class AppModule {}
   ```

3. Fix class-validator DTOs.
   Give every property a validator, use the exact one (`@IsEmail()`, `@IsUUID()`, not `@IsString()`), and import the class as a value, not with `import type`.
   Query values arrive as strings, so convert numbers with `@Type(() => Number)`.
   Nested objects need `@ValidateNested()` and `@Type(() => Child)`.

   ```ts
   import { Type } from 'class-transformer';
   import { ArrayMaxSize, IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

   export class CreateOrderDto {
     @IsString()
     customerId!: string;

     @IsEmail()
     customerEmail!: string;

     @IsInt()
     @Min(1)
     totalCents!: number;
   }

   export class ListOrdersQuery {
     @IsOptional()
     @Type(() => Number)
     @IsInt()
     @Min(1)
     @Max(100)
     take: number = 20;
   }

   export class BulkIdsDto {
     @IsArray()
     @ArrayMaxSize(100)
     @IsUUID('4', { each: true })
     ids!: string[];
   }
   ```

4. Fix Zod schemas.
   Use `z.strictObject()` for bodies so unknown keys are a 400.
   `z.object()` strips them silently, which is safe but hides client typos.
   Attach the schema to the parameter, because a parameter without `schema` is not validated at all.

   ```ts
   import { Body, Controller, Get, Post, Query } from '@nestjs/common';
   import { z } from 'zod';

   export const createOrderSchema = z.strictObject({
     customerId: z.string().min(1),
     customerEmail: z.email(),
     totalCents: z.number().int().min(1),
   });
   export type CreateOrderInput = z.infer<typeof createOrderSchema>;

   export const listOrdersQuery = z.object({
     take: z.coerce.number().int().min(1).max(100).default(20),
     cursor: z.string().optional(),
   });
   export type ListOrdersQueryInput = z.infer<typeof listOrdersQuery>;

   @Controller('orders')
   export class OrdersController {
     @Get()
     list(@Query({ schema: listOrdersQuery }) query: ListOrdersQueryInput) {
       return query;
     }

     @Post()
     create(@Body({ schema: createOrderSchema }) dto: CreateOrderInput) {
       return dto;
     }
   }
   ```

   On `@nestjs/common` older than 12.0.0, use a parameter pipe instead, and plan the upgrade with `nestjs-dependency-updates`.

   ```ts
   import { BadRequestException, PipeTransform } from '@nestjs/common';
   import type { ZodType } from 'zod';

   export class ZodBodyPipe<T> implements PipeTransform<unknown, T> {
     constructor(private readonly schema: ZodType<T>) {}

     transform(value: unknown): T {
       const result = this.schema.safeParse(value);
       if (!result.success) {
         throw new BadRequestException(
           result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
         );
       }
       return result.data;
     }
   }
   ```

   Use it as `@Body(new ZodBodyPipe(createOrderSchema)) dto: CreateOrderInput`.
5. Validate path and single query parameters too: `@Param('id', ParseUUIDPipe) id: string`, or `@Param('id', { schema: z.uuid() })` on Nest 12.
   An unvalidated id that reaches Postgres as a `uuid` turns into a 500 instead of a 400.
6. Make services safe without the pipe: type the page size as `number`, not `number | undefined`, so a caller cannot pass `undefined` to `take`.
   An "export everything" endpoint must page with a cursor or run as a job, not load the table.
7. Keep the body limit at its default.
   Remove a global `app.useBodyParser('json', { limit: ... })` or a raised Fastify `bodyLimit`.
   For one large upload, accept a stream (`multipart/form-data` or `application/octet-stream`) on that route, or let the client upload straight to object storage with a presigned URL.
   Ask the user before you add a storage service.
8. If a global exception filter rewrites errors, keep the `HttpException` response body for 4xx so the field messages reach the client (see `nestjs-error-handling`).

## Verify

1. Add an e2e test that builds the app from the real `AppModule` and does not call `useGlobalPipes`.
   It proves that the `APP_PIPE` provider applies everywhere.
   Send the same auth header the existing e2e tests use, because guards run before pipes and a 401 would hide a missing 400.

   ```ts
   import { INestApplication } from '@nestjs/common';
   import { Test } from '@nestjs/testing';
   import request from 'supertest';
   import { afterAll, beforeAll, describe, expect, it } from 'vitest';
   import { AppModule } from '../src/app.module.js';

   describe('input validation', () => {
     let app: INestApplication;

     beforeAll(async () => {
       const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
       app = moduleRef.createNestApplication();
       await app.init();
     });

     afterAll(async () => {
       await app.close();
     });

     // Replace with the way the existing e2e tests authenticate.
     const auth = { Authorization: `Bearer ${process.env.E2E_TOKEN}` };
     const validOrder = { customerId: 'c1', customerEmail: 'a@example.com', totalCents: 100 };

     it('POST /orders (400) rejects a property that is not in the DTO', async () => {
       await request(app.getHttpServer()).post('/orders').set(auth).send({ ...validOrder, status: 'paid' }).expect(400);
     });

     it('POST /orders (400) rejects a wrong type', async () => {
       await request(app.getHttpServer()).post('/orders').set(auth).send({ ...validOrder, totalCents: 'abc' }).expect(400);
     });

     it('GET /orders (400) rejects a page size above the maximum', async () => {
       await request(app.getHttpServer()).get('/orders?take=100000').set(auth).expect(400);
     });

     it('GET /orders (200) applies the default page size', async () => {
       const response = await request(app.getHttpServer()).get('/orders').set(auth).expect(200);
       expect(response.body.length).toBeLessThanOrEqual(20);
     });
   });
   ```

   Seed more than 20 orders before the last case, or it passes without a default.

2. Prove the body limit against the real build, because an e2e app does not run the code in `main.ts`.
   Build with the project's script, start `node dist/main.js`, and send a 200 KB JSON body.

   ```bash
   python3 -c 'import json; print(json.dumps({"pad": "a" * 200000}))' > big.json
   curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @big.json http://localhost:3000/orders
   ```

   Expect `413` on Express (body parsing runs before guards, so no token is needed).
   On Fastify the default limit is 1 MiB, so send a body larger than that.
3. Run the project's unit and e2e tests and the build.

## Gotchas

- `app.useGlobalPipes()` applies to that app instance only.
  An e2e test that builds its own app from `AppModule` runs without it, so tests pass while production differs, or the other way round.
- `ValidationPipe` validates only when the parameter type is a class.
  An `interface`, a `type`, or a `z.infer` type reflects as `Object`, and the pipe returns the value untouched.
- `import type { CreateOrderDto }` reflects the type as `Function`.
  With `forbidNonWhitelisted` every valid request then fails with 400, and with only `whitelist` the handler gets a value without any of the fields.
  A lint autofix to type-only imports can cause this.
- `whitelist` strips nothing inside a nested object unless the property has `@ValidateNested()` and `@Type(() => Child)`.
- Without `@Type(() => Number)`, `@IsInt()` fails for every query value, because query values are strings.
  Avoid `transformOptions: { enableImplicitConversion: true }` for booleans: any non-empty string, `"false"` too, becomes `true`.
  For the same reason use `z.stringbool()`, not `z.coerce.boolean()`.
- `StandardSchemaValidationPipe` skips a parameter that has no `schema`, without an error.
  Both pipes also skip custom parameter decorators unless `validateCustomDecorators: true` is set.
- `StandardSchemaValidationPipe` returns the schema output by default (`transform: true`), so defaults and coercions apply.
  `ValidationPipe` hands the handler a DTO class instance only with `transform: true`.
- `forbidNonWhitelisted` on a query DTO also rejects unknown query parameters, for example `utm_source`.
  Agree on that with the API's clients.
- `app.useBodyParser('json', { limit: '50mb' })` replaces the limit for every route.
  It is typed on `NestExpressApplication` and `NestFastifyApplication`, not on a plain `INestApplication`, so it does not compile there.

## Related skills

- `nestjs-response-serialization`: the output side of the same boundary.
- `nestjs-auth-deny-by-default`: guards run before pipes, so validation tests need an authenticated request.
- `nestjs-error-handling`: a custom exception filter must keep 400 bodies intact.
- `nestjs-idempotent-writes`: a replayed key with a different body is a 422, after validation.
- `nestjs-http-edge-security`: rate limits for the endpoints that are still expensive after the caps.
- `nestjs-dependency-updates`: `StandardSchemaValidationPipe` and `@Body({ schema })` need Nest 12.
