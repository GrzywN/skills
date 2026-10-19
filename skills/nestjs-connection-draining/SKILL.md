---
name: nestjs-connection-draining
license: MIT
description: Stops a NestJS app from dropping requests and queue jobs during deploys. Adds a preStop delay (lifecycle.preStop.sleep or exec sleep) so Kubernetes can remove the pod from the Service endpoints before SIGTERM, turns on return503OnClosing in NestFactory.create (Nest 12) so new requests get 503 with Connection close while in-flight ones finish, and sizes terminationGracePeriodSeconds to fit the preStop delay, the longest request, keep-alive connections, and the longest BullMQ job, so worker.close() can finish before SIGKILL. Use when the user sees 502, 503, 504, connection refused or connection reset during a rollout, kubectl rollout restart, scale-down or node drain, when jobs run twice or are marked stalled after a deploy, or when pods are killed with exit code 137 at the end of the grace period. Also use when preparing a NestJS app for production or a deploy on Kubernetes, ECS, or Docker behind a load balancer, even if the user does not mention draining.
---

# Drain before you close

When Kubernetes terminates a pod, two things start at the same time: the pod is removed from the Service endpoints, and the kubelet stops the container (`preStop`, then `SIGTERM`).
The endpoint change takes a few seconds to reach every load balancer and kube-proxy.
A server that closes right away refuses the requests that are still routed to it in that window.
After the grace period, `SIGKILL` ends whatever is still running, including queue jobs.

## Check

- [ ] Run the Check of `nestjs-graceful-shutdown` first.
      Without `enableShutdownHooks()` and a signal that reaches Node, `return503OnClosing` and `worker.close()` never run.
- [ ] Open the Deployment (`k8s/`, Helm templates, Kustomize overlays) and search for `preStop`.
      Pass: a `sleep` action or an `exec` of `sleep` for about 5 seconds.
- [ ] Search the same files for `terminationGracePeriodSeconds`.
      If it is missing, the value is 30 seconds.
      Pass: it fits the budget in Apply step 4.
- [ ] Search `src/main.ts` for `NestFactory.create(` and `return503OnClosing`.
      Pass: `return503OnClosing: true` in the options, on `@nestjs/core` and the platform package 12.0.0 or newer.
- [ ] Search for `forceCloseConnections`.
      Pass: not set to `true` (see Gotchas).
- [ ] Search for `@Processor(` and `WorkerHost`.
      For each queue, find the longest job duration in metrics or logs (`finishedOn - processedOn` in BullMQ).
      If there is no data, ask the user.
- [ ] Without Kubernetes, find the stop timeout of the platform: `docker stop -t` (10 seconds by default), `stop_grace_period` in Compose, `stopTimeout` in ECS.

## Apply

1. Add the delay to the container in the Deployment.

   ```yaml
   spec:
     template:
       spec:
         terminationGracePeriodSeconds: 60
         containers:
           - name: orders-api
             lifecycle:
               preStop:
                 sleep:
                   seconds: 5
   ```

   The `sleep` action is on by default from Kubernetes 1.30 and stable from 1.34.
   On an older cluster use `exec: { command: ["sleep", "5"] }`, which needs a `sleep` binary in the image (the Debian `node:*-slim` images have one, distroless images do not).
   Check the cluster version with `kubectl version`, or ask the user.
2. Turn on 503 while closing.
   Put the options in their own file, `src/app-options.ts`, so that the e2e test uses the same ones.

   ```ts
   import type { NestApplicationOptions } from '@nestjs/common';

   export const appOptions: NestApplicationOptions = {
     return503OnClosing: true,
   };
   ```

   ```ts
   import { NestFactory } from '@nestjs/core';
   import { AppModule } from './app.module.js';
   import { appOptions } from './app-options.js';

   async function bootstrap() {
     const app = await NestFactory.create(AppModule, appOptions);
     app.enableShutdownHooks(undefined, { useProcessExit: true });
     await app.listen(process.env.PORT ?? 3000);
   }
   void bootstrap();
   ```

   With Fastify, pass it as the third argument: `NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), appOptions)`.
   On Nest 11 the option does not exist.
   Keep the `preStop` delay, which prevents most of the refused requests, and plan the upgrade with `nestjs-dependency-updates`.
3. If a BullMQ worker runs in the same process, stop it from taking new jobs when shutdown starts.
   `@nestjs/bullmq` closes workers only in `onApplicationShutdown`, after the HTTP server has closed.

   ```ts
   import { Processor, WorkerHost } from '@nestjs/bullmq';
   import { OnModuleDestroy } from '@nestjs/common';
   import { Job } from 'bullmq';

   @Processor('invoices')
   export class InvoicesProcessor extends WorkerHost implements OnModuleDestroy {
     async onModuleDestroy() {
       await this.worker.pause(true);
     }

     async process(job: Job<{ orderId: string }>) {
       // ...
     }
   }
   ```

   `pause(true)` stops fetching and does not wait; `worker.close()` waits for the running jobs later.
4. Set `terminationGracePeriodSeconds` from this budget, and write the numbers in a comment next to it:

   | Part | Typical value |
   | --- | --- |
   | `preStop` delay | 5 s |
   | Longest in-flight request, capped by the outbound timeouts | from `nestjs-outbound-timeouts` |
   | Keep-alive connections that were busy at `SIGTERM` | up to the server's `keepAliveTimeout` (see Gotchas) |
   | Longest queue job that may be running | from the Check |
   | Shutdown hooks (pools, clients) | measured in Verify step 3 |
   | Margin | 5 s |

   If the longest job does not fit in a reasonable grace period, ask the user to choose: a longer grace period, a separate worker Deployment with its own grace period, or shorter jobs (split into steps).
   Jobs must be safe to run twice in any case, because a crash does the same (`nestjs-scheduled-jobs`, `nestjs-idempotent-writes`).
5. On other platforms, set the stop timeout to the same budget, and find out how the platform takes an instance out of the load balancer before it sends `SIGTERM`.
   If its docs do not say, ask the user.

## Verify

1. Add an e2e test that proves in-flight requests finish and new ones get 503 while the app closes.
   It builds a small module with a slow route, and uses the real `appOptions`.

   ```ts
   import { BeforeApplicationShutdown, Controller, Get, Injectable, Module } from '@nestjs/common';
   import { NestFactory } from '@nestjs/core';
   import { get, type IncomingMessage } from 'node:http';
   import { setTimeout as delay } from 'node:timers/promises';
   import { expect, it } from 'vitest';
   import { appOptions } from '../src/app-options.js';

   @Controller()
   class SlowController {
     @Get('slow')
     async slow() {
       await delay(500);
       return 'done';
     }
   }

   @Injectable()
   class SlowShutdownHook implements BeforeApplicationShutdown {
     beforeApplicationShutdown() {
       return delay(300);
     }
   }

   @Module({ controllers: [SlowController], providers: [SlowShutdownHook] })
   class DrainTestModule {}

   // agent: false sends "Connection: close", so no idle keep-alive socket holds up app.close()
   function request(url: string) {
     return new Promise<IncomingMessage & { body: string }>((resolve, reject) => {
       get(url, { agent: false }, (res) => {
         let body = '';
         res.setEncoding('utf8');
         res.on('data', (chunk: string) => (body += chunk));
         res.on('end', () => resolve(Object.assign(res, { body })));
       }).on('error', reject);
     });
   }

   it('finishes in-flight requests and answers new ones with 503 while closing', async () => {
     const app = await NestFactory.create(DrainTestModule, { ...appOptions, logger: false });
     await app.listen(0);
     const url = await app.getUrl();

     const inFlight = request(`${url}/slow`);
     await delay(50);
     const closing = app.close();
     await delay(50);

     const late = await request(`${url}/slow`);
     expect(late.statusCode).toBe(503);
     expect(late.headers.connection).toBe('close');

     const first = await inFlight;
     expect(first.statusCode).toBe(200);
     expect(first.body).toBe('done');
     await closing;
   });
   ```

   For Fastify, create the app with `new FastifyAdapter()` as the second argument.
   Run it with the project's e2e target.
2. In a staging cluster, with the user's permission, run a request loop in one terminal and restart the Deployment in another.
   Stop the loop with Ctrl-C when the rollout is done, then count the codes with `sort codes.txt | uniq -c`.

   ```bash
   while true; do curl -s -o /dev/null -w '%{http_code}\n' https://<staging-host>/health; done > codes.txt
   ```

   ```bash
   kubectl rollout restart deploy/<name> && kubectl rollout status deploy/<name>
   ```

   Pass: only `200` codes, no `000`, `502`, `503`, or `504`, through the whole rollout.
3. Measure the shutdown time: `kubectl logs -f <old-pod>` from `SIGTERM` until the last shutdown log line, and compare it with `terminationGracePeriodSeconds`.
   Pass: the old pods end with exit code `0` or `143`, not `137`.
4. For a queue, in staging and with the user's permission, start a job that takes longer than the remaining budget, delete its pod, and watch the job.
   Expect it to run again after its lock expires.
   This shows the budget is real, and why the job must be safe to run twice.

## Gotchas

- `return503OnClosing` alone does not fix the propagation window: the 503s reach clients that are still routed to the pod.
  Use it together with the delay, not instead of it.
- The 503 starts the moment Nest receives `SIGTERM`, before `onModuleDestroy`.
  So an in-app delay (for example `gracefulShutdownTimeoutMs` of `@nestjs/terminus`, or a sleep in `beforeApplicationShutdown`) answers 503 for its whole length when `return503OnClosing` is on.
  Put the delay in `preStop`.
- The `preStop` time counts against `terminationGracePeriodSeconds`.
  If `preStop` fails (for example no `sleep` binary in the image), Kubernetes kills the container.
- `forceCloseConnections: true` destroys every open socket when the HTTP server closes, including sockets with a request still running.
  Do not combine it with draining.
- The HTTP server closes only when its last connection closes.
  A keep-alive connection that was busy at `SIGTERM` stays open after its response, until the client closes it or `keepAliveTimeout` expires.
  Node's default is 5 seconds (Express); Fastify's is 72 seconds, and in a test with Fastify defaults `app.close()` waited about 70 seconds for one such connection.
  Measure it (Verify step 3) and count it in the budget.
- `return503OnClosing` answers only while Nest is in its shutdown hooks, and on connections that are reused after that.
  New connections after the server closes are refused.
- A terminating pod's endpoints are marked not ready by Kubernetes itself.
  You do not need a failing readiness probe to drain.
- BullMQ: a job killed by `SIGKILL` keeps its lock until `lockDuration` (30 s by default) runs out, then the stalled checker moves it back to `wait`, and another worker runs it from the start.
  A job that stalls more often than `maxStalledCount` (1 by default) is moved to `failed` instead.
- Express answers the 503 with a plain text body, Fastify with JSON `{ statusCode, error, message }`.

## Related skills

- `nestjs-graceful-shutdown`: `enableShutdownHooks`, the signal reaching Node, and the shutdown order this skill relies on.
- `nestjs-scheduled-jobs`: BullMQ job options, and jobs and cron runs that are safe on many replicas and safe to run twice.
- `nestjs-idempotent-writes`: writes that a re-run job or a retried request cannot repeat.
- `nestjs-outbound-timeouts`: caps the longest in-flight request, which sets part of the budget.
- `nestjs-observability`: readiness and liveness probes.
- `nestjs-production-checklist`: runs this check as item 3 and settles the shared shutdown budget with item 2 and item 4.
