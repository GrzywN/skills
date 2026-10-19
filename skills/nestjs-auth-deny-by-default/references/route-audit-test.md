# Route audit test

This e2e test lists every controller route, calls it without credentials, and expects 401 unless the route is on a reviewed allowlist.
A new controller without `@Public()` passes.
A new `@Public()` route fails until someone adds it to `PUBLIC_ROUTES` on purpose, so the allowlist is where reviews look.

It boots the real `AppModule`, so run it with the project's e2e database and Redis.
It works for path A and path B, because it checks responses, not metadata.

```ts
// test/public-routes.e2e-spec.ts
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

const PUBLIC_ROUTES = new Set(['GET /health']);

function toPath(...parts: Array<string | string[] | undefined>): string {
  const segments = parts
    .flat()
    .flatMap((part) => (part ?? '').split('/'))
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? '1' : segment));
  return `/${segments.join('/')}`;
}

function listRoutes(app: INestApplication) {
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  return app
    .get(DiscoveryService)
    .getControllers()
    .flatMap(({ metatype, instance }) => {
      if (!metatype || !instance) {
        return [];
      }
      const prototype = Object.getPrototypeOf(instance);
      const base = reflector.get<string | string[]>(PATH_METADATA, metatype);
      return scanner.getAllMethodNames(prototype).flatMap((name) => {
        const handler = prototype[name];
        const sub = reflector.get<string | string[] | undefined>(PATH_METADATA, handler);
        const method = reflector.get<RequestMethod | undefined>(METHOD_METADATA, handler);
        if (sub === undefined || method === undefined) {
          return [];
        }
        return [{ method: RequestMethod[method], path: toPath(base, sub) }];
      });
    });
}

describe('every route requires authentication (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close());

  it('answers 401 without a token, except on the reviewed public routes', async () => {
    const routes = listRoutes(app);
    expect(routes.length).toBeGreaterThan(0);
    for (const { method, path } of routes) {
      const key = `${method} ${path}`;
      const response = await fetch(`${baseUrl}${path}`, { method });
      expect(response.status === 401, key).toBe(!PUBLIC_ROUTES.has(key));
    }
  });
});
```

- Add the global prefix (`app.setGlobalPrefix()`) or the version segment to `toPath` if `main.ts` sets them, and apply the same setup to the test app.
- Path parameters get the value `1`; a guard runs before pipes, so the value does not matter for the 401.
- A route that answers 401 for another reason (its own check) also passes as protected; keep such checks out of public routes.
- Run it once with the `APP_GUARD` line removed and confirm it fails, then put the line back.
