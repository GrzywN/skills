---
name: nestjs-auth-deny-by-default
license: MIT
description: Makes NestJS authentication deny-by-default. Registers one global auth guard (APP_GUARD or @nestjs/authentication AuthenticationModule), opts routes out with @Public() read through Reflector.getAllAndOverride, exposes the user with @CurrentUser(), orders the guard against ThrottlerGuard and other global guards, and adds an e2e test that fails when a new route is public by accident. Use when a codebase has @UseGuards(AuthGuard), @UseGuards(JwtAuthGuard) or AuthGuard('jwt') on each controller, a controller with no guard (admin, export, internal endpoints), a guard that throws 500 on a bad token, or when adding @nestjs/authentication, @nestjs/jwt or passport. Use when reviewing a diff that adds a controller or a @Public() route, when asked "is every endpoint protected?", and also when preparing a NestJS app for production or a deploy, even if the user does not mention authentication.
---

# Authentication deny-by-default

`@UseGuards(AuthGuard)` on each controller fails open.
The one controller where someone forgets the decorator is public, and nothing tells you.
Invert it: one global guard requires a signed-in user on every route, and each exception is marked with `@Public()`.
Then a review has one thing to check: every `@Public()` in the diff.

## Check

Open the root module (`src/app.module.ts`), `src/main.ts`, every `*.controller.ts`, and the auth guard file.

- [ ] Search for `APP_GUARD`, `AuthenticationModule.forRoot` and `AuthenticationModule.forRootAsync`.
      Pass: an auth guard is registered with `APP_GUARD`, or `AuthenticationModule` is imported without `globalGuard: false`.
- [ ] Search for `@UseGuards(`.
      An auth guard listed there, next to a global one, runs twice.
      An auth guard listed there with no global one means fail-open: list every `@Controller(` and mark the ones without it.
- [ ] Search for `@Public()` and `SetMetadata(`.
      Pass: each public route is one of health checks, sign-in/sign-up/password reset, webhooks with their own signature check, or a route the user confirmed as public.
- [ ] Open the guard.
      Pass: it reads the public flag with `getAllAndOverride` over `[context.getHandler(), context.getClass()]` before it reads credentials.
- [ ] In the guard, find the token verification call (`verifyAsync`, `verify`, `validate`).
      Pass: a failed verification becomes `UnauthorizedException`.
      A thrown library error (for example `JsonWebTokenError`) turns a bad token into a 500.
- [ ] Search `main.ts` for `SwaggerModule.setup`, `app.use(` and `connectMicroservice(`.
      These are outside the guard (see Gotchas).

## Apply

Detect first:

- Auth library: `@nestjs/authentication`, `@nestjs/jwt`, `@nestjs/passport`, or a hand-written guard (read `package.json`).
- HTTP platform: `@nestjs/platform-express` or `@nestjs/platform-fastify`.
- Package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`), and Makefile targets for build and test.

Then follow path A or path B.
Do not migrate a working auth stack to another library unless the user asks.

### Path A: the project keeps its own guard

1. Add the decorator.

```ts
// src/common/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
```

2. Make the guard skip public routes and answer 401 for every bad token.
   Parse the header with string operations, not `replace('Bearer ', '')`, which accepts any header that contains a token.

```ts
// src/common/jwt-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';

export interface AuthUser {
  sub: string;
  roles?: string[];
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }
    try {
      request.user = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      // An expired or forged token is a 401, not a 500.
      throw new UnauthorizedException();
    }
    return true;
  }
}
```

3. Register the guard globally in the root module.
   The guard's dependencies must be visible there: with `@nestjs/jwt`, move `JwtModule` from the feature module to the root module with `global: true`, and read the secret through `ConfigService` (see `nestjs-config-validation`).

```ts
// src/app.module.ts (excerpt)
JwtModule.registerAsync({
  global: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_SECRET'),
    verifyOptions: { algorithms: ['HS256'] },
  }),
}),
// ...
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
],
```

   Keep `ThrottlerGuard` before the auth guard if the project has one (see Gotchas on order).

4. Remove `@UseGuards(JwtAuthGuard)` from controllers, so the guard does not run twice.
5. Add `@Public()` only where the Check list allows it.
   Health and readiness controllers get it, because probes send no token.
   For any other route, ask the user before you make it public.
   An admin route is never fixed by authentication alone: it also needs a role check, so flag it and ask how roles are stored.
6. Give handlers the user.

```ts
// src/common/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
```

### Path B: `@nestjs/authentication`

Use it when the project already depends on it, or the user asks for it.
It needs `@nestjs/common` and `@nestjs/core` 12 and Node 20.19 or later (checked in `@nestjs/authentication` 0.1.1).
`AuthenticationModule.forRoot()` registers `AuthenticationGuard` as a global guard (`globalGuard` defaults to `true`), so every route answers 401 without credentials.
`@Public()`, `@Authenticate()` and `@CurrentUser()` come from the package.

A service that only verifies bearer tokens from another issuer needs no `accessToken` option and no stores:

```ts
// src/auth/jwt.auth.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';

export interface AuthUser {
  id: string;
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthUser;
  }
}

@Injectable()
export class JwtAuth extends JwtBearerProvider<AuthUser> {
  constructor(config: ConfigService, registry: AuthenticationRegistry) {
    super({ key: config.getOrThrow<string>('JWT_SECRET') });
    registry.registerProvider(this);
  }

  protected validate(claims: JwtClaims): AuthUser | null {
    return claims.sub ? { id: claims.sub } : null;
  }
}
```

```ts
// src/app.module.ts (excerpt)
imports: [AuthenticationModule.forRoot()],
providers: [JwtAuth, { provide: APP_GUARD, useClass: ThrottlerGuard }],
```

- `@Public()` on a method or a class skips every provider; `@CurrentUser()` is then `null`.
- `@Authenticate()` on a method requires a user again under a `@Public()` class.
- `@Authenticate({ optional: true })` lets anonymous callers through, but still answers 401 for a bad token.
- With `accessToken`, sessions, MFA, magic links, OIDC, password reset or email verification configured, startup fails under `NODE_ENV=production` until you register real stores with `AuthenticationStorage.registerSource()`.
  Do not set `allowInMemoryStorage: true` to get past it: every deploy signs everyone out, and replicas do not share state.
- For sign-in flows, sessions and stores, read https://docs.nestjs.com/security/authentication.

## Verify

Prove it with the real `AppModule` against the project's e2e database and Redis.
The Vitest e2e config must emit decorator metadata (the Nest docs use `unplugin-swc`), or DI by type fails.

1. Add the route audit test from `references/route-audit-test.md` (read it when you write the Verify step).
   It lists every controller route, calls it without credentials, and expects 401 unless the route is on a reviewed allowlist, for example `GET /health`.
   Run it once with the `APP_GUARD` line removed and confirm it fails; then put the line back.
2. Add cases for a forged token (`Authorization: Bearer x`) and an expired token: both answer 401, not 500.
3. Boot the app and curl it: `curl -i localhost:3000/admin/orders/export` answers 401, `curl -i localhost:3000/health` answers 200.

## Gotchas

- `getAllAndOverride` checks the handler first, then the class: the method's value wins.
  `@Public()` on a class makes every method added later public too, so prefer it on methods, except for health and auth controllers.
- Global guards run in the order Nest scans their providers: the root module's `providers` first, in array order, then imported modules in import order.
  `AuthenticationModule` registers its guard inside its own module, so an `APP_GUARD` in the root module runs before it.
  Put `ThrottlerGuard` first, so guessed tokens count against the rate limit instead of only getting a 401.
  A guard that needs the user (roles, `@nestjs/authorization`) must come after the auth guard; import `AuthenticationModule` before `AuthorizationModule`.
- Guards protect controller routes only.
  `SwaggerModule.setup()` registers `/docs` directly on the HTTP adapter, and `app.use()` middleware runs before guards, so neither is covered (see `nestjs-response-serialization` for Swagger).
- Global guards do not run on GraphQL field resolvers unless the GraphQL module sets `fieldResolverEnhancers: ['guards']`, or on a hybrid app's message handlers unless it uses `app.connectMicroservice(options, { inheritAppConfig: true })`.
- `@nestjs/authentication` takes lifetimes in milliseconds or strings like `'15m'`; `@nestjs/jwt` takes seconds.
  Its HS256 key must be at least 32 bytes, or startup fails.
- `AuthenticationModule.forRoot({ globalGuard: false })` turns deny-by-default off again.
- `@nestjs/jwt` 11.x lists only Nest 8 to 11 as peers; 12.x adds Nest 12 (see `nestjs-dependency-updates`).

## Related skills

- `nestjs-http-edge-security`: the throttler guard that runs next to this one, and `trust proxy` so it sees client IPs.
- `nestjs-config-validation`: `JWT_SECRET` read with `getOrThrow` and validated at boot.
- `nestjs-response-serialization`: Swagger outside the guard, and what `@CurrentUser()` data may leave in a response.
- `nestjs-error-handling`: a guard error must keep its 401 status through the exception filter.
- `nestjs-dependency-updates`: aligning `@nestjs/jwt` and the other `@nestjs/*` packages.
