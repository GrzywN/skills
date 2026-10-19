# Testing resilience with the real AppModule

Test the behaviour, not the configuration: a hanging dependency must end in a 504 after the configured attempts, and an open breaker must serve the fallback without calling the dependency.
Do not wait for real timeouts or a real `openDuration`.

The test below replaces only the carrier's `HttpClient` with one that uses a stub `fetch`, so the preset, the breaker, the fallback and the error mapping all run for real.
It fakes only `setTimeout`, `clearTimeout` and `Date`, so the HTTP server and supertest keep real I/O.

```ts
import type { INestApplication } from '@nestjs/common';
import { getHttpClientToken, HttpClient } from '@nestjs/http-client';
import { ResilienceService } from '@nestjs/resilience';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('GET /shipping/quotes', () => {
  let app: INestApplication;
  const carrierFetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getHttpClientToken('carrier'))
      .useValue(new HttpClient({ baseUrl: 'http://carrier.test', retry: false, fetch: carrierFetch }))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    carrierFetch.mockReset();
    await app.close();
  });

  it('answers 504 after two attempts when the carrier hangs', async () => {
    carrierFetch.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    const response = request(app.getHttpServer())
      .get('/shipping/quotes?orderId=1')
      .then((res) => res);
    await vi.waitFor(() => expect(carrierFetch).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await response).status).toBe(504);
    expect(carrierFetch).toHaveBeenCalledTimes(2);
    expect(carrierFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('serves flat-rate quotes while the breaker is open', async () => {
    app.get(ResilienceService).circuitBreaker('carrier').trip();

    const response = await request(app.getHttpServer()).get('/shipping/quotes?orderId=1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ carrier: 'flat-rate', priceCents: 499 }]);
    expect(carrierFetch).not.toHaveBeenCalled();
  });
});
```

Notes:

- The stub only settles when its signal aborts, like a real hanging upstream.
  The last assertion fails when the service does not pass the attempt's signal to the client, because then nothing aborts the request.
- `vi.waitFor()` waits until the request reached the carrier, so there is a timer to advance.
- `trip()` opens the breaker without producing `minimumCalls` failures.
  Moving the fake clock past `openDuration` makes the next call a probe, and `breaker.state` returns to `'closed'` when the probe succeeds.
- Breakers and bulkheads belong to the application that created them, so each test app starts with fresh state.
- For other settings in a test, such as a shorter `openDuration`, override `RESILIENCE_MODULE_OPTIONS` with `overrideProvider()`.
- Nest needs decorator metadata at runtime.
  Vitest's default transform does not emit it, so use the project's existing SWC or Babel setup for tests (for example `unplugin-swc`), or the project's Jest setup.
- The file name must match the test runner's include pattern, for example `*.e2e-spec.ts` in the e2e config.
