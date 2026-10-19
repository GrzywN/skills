# Durable providers

Read this when a provider needs a different instance per tenant (a connection, a client, a schema), not per request.
A durable provider is still `Scope.REQUEST`, but Nest builds its sub-tree once per tenant and reuses it, instead of once per request.
Durability bubbles up like request scope: a class whose request-scoped dependencies are all durable is durable too.

## Strategy and provider

The strategy tells Nest which tenant a request belongs to.
This one reads a header and accepts only tenants from a known list.

```ts
import type { IncomingMessage } from 'node:http';
import { ContextId, ContextIdFactory, ContextIdStrategy, HostComponentInfo } from '@nestjs/core';

export interface TenantPayload {
  tenantId: string;
}

export class TenantContextIdStrategy implements ContextIdStrategy<Pick<IncomingMessage, 'headers'>> {
  private readonly tenantContextIds = new Map<string, ContextId>();

  constructor(private readonly knownTenants: ReadonlySet<string>) {}

  attach(contextId: ContextId, request: Pick<IncomingMessage, 'headers'>) {
    const tenantId = request.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || !this.knownTenants.has(tenantId)) {
      return () => contextId;
    }
    let tenantContextId = this.tenantContextIds.get(tenantId);
    if (tenantContextId === undefined) {
      tenantContextId = ContextIdFactory.create();
      this.tenantContextIds.set(tenantId, tenantContextId);
    }
    const durableContextId = tenantContextId;
    const payload: TenantPayload = { tenantId };
    return {
      resolve: (info: HostComponentInfo) => (info.isTreeDurable ? durableContextId : contextId),
      payload,
    };
  }
}
```

```ts
import { BadRequestException, Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { TenantPayload } from './tenant-context-id.strategy.js';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class TenantConnection {
  readonly tenantId: string;

  constructor(@Inject(REQUEST) payload: TenantPayload | undefined) {
    if (payload === undefined) {
      throw new BadRequestException('Unknown tenant');
    }
    this.tenantId = payload.tenantId;
  }
}
```

Register the strategy in `main.ts` before `listen()`: `ContextIdFactory.apply(new TenantContextIdStrategy(tenantIds))`.
In a durable provider, `REQUEST` is the payload, not the HTTP request.
Ask the user where the list of tenants comes from.

## Gotchas

- `ContextIdStrategy.attach()` runs before guards, so `request.user` from a guard is not there yet.
  Accept only known tenants: a map keyed by a raw header grows with every value a client sends.
  The guard must still check that the user belongs to the tenant.
- `durable: true` is read only on a provider declared with `scope: Scope.REQUEST`.
  When the strategy returns the plain context id (an unknown tenant), the durable provider receives `undefined` as `REQUEST`, so it must reject the request.
- The map in the strategy holds one sub-tree per tenant for the life of the process.
  The Nest docs warn that this does not suit a large number of tenants.
- Verify with two tenants: the provider is built once per tenant across many requests, and an unknown tenant gets a 4xx.
