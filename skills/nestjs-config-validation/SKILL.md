---
name: nestjs-config-validation
license: MIT
description: Makes a NestJS app refuse to boot when an environment variable is missing or malformed, and keeps secrets out of the Docker image and the logs. Adds a Standard Schema (Zod, Valibot, ArkType, Joi 18) as validationSchema in ConfigModule.forRoot from @nestjs/config, reads required values with ConfigService.getOrThrow, removes console.log of the config object, moves secrets from Dockerfile ARG/ENV and copied .env files to the platform secret store, and adds a .dockerignore. Use when the code uses ConfigModule, ConfigService, config.get or process.env, when the user mentions .env files, env validation, "Config validation error", secrets or API keys in a Docker image, docker history, or a pod that passed its health check and then failed on the first request that read a value (an empty key, a 401 from Stripe, a wrong DATABASE_URL). Also use when preparing a NestJS app for production or a deploy, or reviewing a Dockerfile or Kubernetes manifest, even if the user does not mention config.
---

# Config validation at boot

A missing or malformed environment variable must stop the process before it takes a request.
Otherwise the app boots, passes its health check, takes traffic, and fails on the first request that reads the value.
A version that fails on boot never becomes ready, so a rolling deploy keeps the previous version serving.
Secrets belong in the platform's secret store, injected at runtime, and never in the image or the logs.

## Check

- [ ] Search `src/` for `ConfigModule.forRoot(`.
      Pass: it has `validationSchema` or `validate`.
- [ ] Read the installed `@nestjs/config` version from the lockfile or `node_modules/@nestjs/config/package.json`.
      `validationSchema` takes a Standard Schema from 12.0.0.
      Version 4.x and older take only Joi there (see Gotchas).
- [ ] List every variable the code reads: search for `config.get(`, `configService.get(`, `getOrThrow(`, `process.env.`, and read `.env.example`.
      Pass: each one is in the schema, and a required one has no silent fallback such as `?? ''`.
- [ ] Search for logs of the config: `console.log(` near `config` or `process.env`, `Loaded config`, `JSON.stringify(process.env`.
      Pass: nothing prints values.
- [ ] Open the `Dockerfile`.
      Fail: a secret name (`SECRET`, `KEY`, `TOKEN`, `PASSWORD`, a `DATABASE_URL` with a password) in `ARG` or `ENV`.
      Fail: `COPY . .` and no `.dockerignore` with `.env*` in it.
- [ ] Open the deploy manifests (`k8s/`, `helm/`, `docker-compose*.yml`, the PaaS config).
      Pass: secrets come from `secretRef`, `secretKeyRef`, or the platform's secret store, not from a literal `value:`.

## Apply

1. Pick the schema library the project already has (`zod`, `valibot`, `arktype`, or `joi` 18 or newer, which implements Standard Schema).
   If it has none, install `zod` with the package manager of the lockfile.
2. Write `src/config/env.schema.ts` with every variable from the Check.

   ```ts
   import { z } from 'zod';

   export const envSchema = z.object({
     NODE_ENV: z.enum(['development', 'test', 'production']),
     PORT: z.coerce.number().int().default(3000),
     DATABASE_URL: z.url(),
     REDIS_URL: z.url(),
     STRIPE_SECRET_KEY: z.string().min(1),
     JWT_SECRET: z.string().min(1),
   });

   export type Env = z.infer<typeof envSchema>;
   ```

   - Give every secret `.min(1)`.
   - Use `z.coerce.number()` for numbers and `z.stringbool()` for booleans.
   - Give defaults only to values that are not secrets.
   - Use `z.object`, not `z.strictObject`: the environment always has other variables such as `PATH`.
3. Pass the schema to `ConfigModule.forRoot`.

   ```ts
   import { Module } from '@nestjs/common';
   import { ConfigModule } from '@nestjs/config';
   import { envSchema } from './config/env.schema.js';

   @Module({
     imports: [ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema })],
   })
   export class AppModule {}
   ```

   With `@nestjs/config` older than 12, use `validate: (env) => envSchema.parse(env)` instead of `validationSchema`.
4. Read required values with `getOrThrow`, or with a typed `ConfigService` so the compiler knows the parsed type.

   ```ts
   TypeOrmModule.forRootAsync({
     inject: [ConfigService],
     useFactory: (config: ConfigService<Env, true>) => ({
       type: 'postgres',
       url: config.get('DATABASE_URL', { infer: true }),
       autoLoadEntities: true,
     }),
   }),
   ```

   In services, replace `this.config.get('STRIPE_SECRET_KEY')` with `this.config.getOrThrow<string>('STRIPE_SECRET_KEY')`.
5. Delete every log of the config object or of `process.env`.
   If someone needs to see what loaded, log the names of the keys, never the values.
6. Take secrets out of the image.
   - Delete `ARG` and `ENV` lines that carry a secret from the `Dockerfile`, and the matching `--build-arg` in CI.
   - Add a `.dockerignore` next to the `Dockerfile` with at least `.env*`, `node_modules`, `dist`, and `.git`.
   - Inject secrets at runtime: `envFrom` with `secretRef` or `env` with `secretKeyRef` in Kubernetes, the secret store of the PaaS, or `--env-file` that stays outside the image.
   - Do not write real secret values into manifests, CI files, or `.env.example`.
     Ask the user to put them in the secret store.
7. If a secret was in an image that was pushed to a registry, it is still in that image.
   Tell the user to rotate it.
   Do not rotate keys or call the provider yourself.
8. Add a unit test for the schema next to the other tests.

   ```ts
   import { describe, expect, it } from 'vitest';
   import { envSchema } from '../src/config/env.schema.js';

   const valid = {
     NODE_ENV: 'production',
     DATABASE_URL: 'postgres://orders:orders@localhost:5432/orders',
     REDIS_URL: 'redis://localhost:6379',
     STRIPE_SECRET_KEY: 'sk_test_x',
     JWT_SECRET: 'test-secret',
   };

   describe('envSchema', () => {
     it('accepts a complete environment', () => {
       expect(envSchema.safeParse(valid).success).toBe(true);
     });

     it.each(['DATABASE_URL', 'REDIS_URL', 'STRIPE_SECRET_KEY', 'JWT_SECRET'])(
       'rejects a missing or empty %s',
       (key) => {
         expect(envSchema.safeParse({ ...valid, [key]: undefined }).success).toBe(false);
         expect(envSchema.safeParse({ ...valid, [key]: '' }).success).toBe(false);
       },
     );
   });
   ```

## Verify

1. Build with the project's build target (`make build` or the `build` script).
   Take the entry file from the `start:prod` script (`dist/main.js` in the Nest starter).
2. Boot the built app with one required variable missing, from a directory with no `.env` file, because `ConfigModule` reads `.env` from the working directory:

   ```bash
   APP="$PWD"
   cd /tmp && env -i PATH="$PATH" NODE_ENV=production DATABASE_URL=postgres://u:p@localhost:5432/db \
     REDIS_URL=redis://localhost:6379 JWT_SECRET=test-secret node "$APP/dist/main.js"; echo "exit=$?"
   ```

   Pass: `exit=1` and the log says `Config validation error: STRIPE_SECRET_KEY: ...`.
   Run it again with `STRIPE_SECRET_KEY=` (empty).
   Pass: it fails again.
3. Boot it with a complete environment.
   Pass: it starts (it may then fail to reach the database, which is a different error).
4. Run the unit tests and the e2e tests.
   An e2e test that imports `AppModule` now needs a valid environment, for example from a `.env.test` loaded by the test setup.
5. When Docker is available, build the image and check it:
   - `docker history --no-trunc <image> | grep STRIPE` prints nothing.
   - `docker image inspect <image> --format '{{json .Config.Env}}'` has no secret.
   - `docker run --rm --entrypoint ls <image> -a /app` shows no `.env` file.

## Gotchas

- `getOrThrow` throws only for `undefined`.
  An empty string passes, so the schema needs `.min(1)`.
- `ConfigService.get` returns the parsed value (a number for `PORT`), but `process.env` keeps strings.
  Code that reads `process.env` directly still gets `'3000'`.
- On `@nestjs/config` 4.x, `validationSchema` is typed `any` and expects Joi.
  A Zod schema there fails with `validationSchema.validate is not a function` before Zod 4.6.
  From Zod 4.6 it passes silently, because Zod's own `validate()` returns a boolean and the config module reads `error` from it.
  Use `validate` on 4.x.
- From 12.0.0, the module validates `process.env` too (`validatePredefined` defaults to `true`) and merges the variables the schema does not declare back in.
  A strict object schema rejects the whole environment.
- `z.coerce.boolean()` turns `'false'` into `true`.
  Use `z.stringbool()`.
- A `.env` file copied into the image fills in any variable the platform did not inject, so validation passes with development values.
  That is one more reason for `.env*` in `.dockerignore`.
- `ARG` values show up in `docker history`, and `ENV` values in the image config.
  Anyone who can pull the image can read both.
- `console.log(config)` on a `ConfigService` prints every loaded value.
  A debug log like that ships every credential to the log pipeline.

## Related skills

- `nestjs-graceful-shutdown`: rewrites the rest of the `Dockerfile` (multi-stage, non-root, exec-form `CMD`) and the `.dockerignore`.
- `nestjs-auth-deny-by-default`: `JWT_SECRET` comes from this schema.
- `nestjs-observability`: structured logs that never include the config.
- `nestjs-dependency-updates`: upgrade `@nestjs/config` to 12 for Standard Schema support.
- `nestjs-production-checklist`: runs this check as item 1.
