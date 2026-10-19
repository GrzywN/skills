---
name: nestjs-graceful-shutdown
license: MIT
description: Makes a NestJS app shut down cleanly on SIGTERM and fixes the container image around it. Adds app.enableShutdownHooks() so onModuleDestroy, beforeApplicationShutdown and onApplicationShutdown run, gets the signal to Node with an exec-form CMD instead of npm run start:prod or a shell, handles Node as PID 1 with tini, docker --init, or the useProcessExit option, and rewrites the Dockerfile as a multi-stage, non-root image with NODE_ENV=production, npm ci, a .dockerignore, and package.json for ESM. Sets --max-old-space-size (or --max-old-space-size-percentage) in NODE_OPTIONS below the container memory limit. Use when pods take 30 seconds to stop, docker stop hangs, exit code 137, OOMKilled, restarts with no log line, queue jobs or requests are cut off during a deploy, or the user asks about a Dockerfile, CMD, ENTRYPOINT, a node:20 image, or memory limits. Also use when preparing a NestJS app for production or a deploy, even if the user does not mention shutdown.
---

# Graceful shutdown and the container image

Deploys, scale-downs and node drains all send `SIGTERM`.
Nest does not listen for it unless you ask, so by default the shutdown hooks never run: pools stay open, queue workers die mid-job, and in-flight requests are dropped.
In a container the signal is also easy to lose before it reaches Node.
And if V8's heap limit is above the container's memory limit, the kernel kills the process with exit code 137 and no log line.

## Check

- [ ] Search `src/main.ts` for `enableShutdownHooks(`.
      Pass: it is called on the app before `listen`.
- [ ] Open the `Dockerfile` and find `CMD` and `ENTRYPOINT`.
      Fail: `CMD npm ...`, `CMD ["npm", ...]`, the shell form `CMD node dist/main.js`, or an entrypoint script that starts Node without `exec`.
      Pass: `CMD ["node", ..., "dist/main.js"]`, with the path taken from the `start:prod` script.
- [ ] Find out who is PID 1.
      Search the `Dockerfile` for `tini` and `dumb-init`, the compose file for `init: true`, and the run command for `--init`.
      If none is there, Node is PID 1 (see Gotchas), and `useProcessExit: true` must be set.
- [ ] In the `Dockerfile`, check each item:
      two stages (`AS build`), `npm ci` (or the frozen-lockfile install of the project's package manager), `ENV NODE_ENV=production` in the runtime stage, `USER node` (or another non-root user), `package.json` copied into the runtime stage, and a supported Node LTS base image.
- [ ] Check that a lockfile is committed (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
      `npm ci` fails without one.
- [ ] Check that `.dockerignore` exists and lists `node_modules`, `dist`, `.git`, and `.env*`.
- [ ] Open the deploy manifest.
      If the container has a memory limit (`resources.limits.memory`), pass only when `NODE_OPTIONS` sets `--max-old-space-size` to about 75% of it, or `--max-old-space-size-percentage`.
- [ ] Search `src/` for resources the app creates itself: `setInterval(`, `new Pool(`, `createClient(`, `new Redis(`, `new Worker(`.
      Pass: each one is closed in `onApplicationShutdown`.

## Apply

1. Enable the shutdown hooks in `src/main.ts`.

   ```ts
   import { NestFactory } from '@nestjs/core';
   import { AppModule } from './app.module.js';

   async function bootstrap() {
     const app = await NestFactory.create(AppModule);
     app.enableShutdownHooks(undefined, { useProcessExit: true });
     await app.listen(process.env.PORT ?? 3000);
   }
   void bootstrap();
   ```

   The signature is `enableShutdownHooks(signals?, options?)`.
   With no signals it listens to all of `ShutdownSignal`, which includes `SIGTERM` and `SIGINT`.
   `useProcessExit` needs `@nestjs/core` and `@nestjs/common` 11.1.10 or newer.
   On an older version, call `app.enableShutdownHooks()` and use an init process (step 3).
2. Close what Nest does not manage in `onApplicationShutdown`.
   It runs after the HTTP server has closed, so no request still needs the resource.

   ```ts
   import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

   @Injectable()
   export class MetricsFlusher implements OnApplicationBootstrap, OnApplicationShutdown {
     private timer?: NodeJS.Timeout;

     onApplicationBootstrap() {
       this.timer = setInterval(() => void this.flush(), 10_000);
     }

     async onApplicationShutdown() {
       clearInterval(this.timer);
       await this.flush();
     }

     private async flush() {}
   }
   ```

3. Rewrite the `Dockerfile`.
   Keep the project's Node major if it is still supported, and use the install and prune commands of its package manager.

   ```dockerfile
   FROM node:24-slim AS build
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build && npm prune --omit=dev

   FROM node:24-slim
   ENV NODE_ENV=production
   WORKDIR /app
   COPY --from=build /app/package.json ./
   COPY --from=build /app/node_modules ./node_modules
   COPY --from=build /app/dist ./dist
   USER node
   EXPOSE 3000
   CMD ["node", "--enable-source-maps", "dist/main.js"]
   ```

   - `package.json` is in the runtime stage on purpose: the Nest 12 starter is ESM, and Node reads `"type": "module"` from it.
   - If there is no lockfile, run `npm install --package-lock-only`, and tell the user to commit the result.
   - Keep secret `ARG` and `ENV` lines out (see `nestjs-config-validation`).
   - If you cannot use `useProcessExit`, add an init process in the runtime stage:

     ```dockerfile
     RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
     ENTRYPOINT ["/usr/bin/tini", "--"]
     ```

     With plain Docker or Compose, `docker run --init` or `init: true` does the same.
4. Add `.dockerignore` next to the `Dockerfile`.

   ```
   .git
   node_modules
   dist
   coverage
   .env*
   ```

5. Set the heap limit where the memory limit is set.
   For a 1 GiB limit in Kubernetes:

   ```yaml
   env:
     - name: NODE_OPTIONS
       value: "--max-old-space-size=768"
   ```

   On Node 24.6.0 or newer, or 22.21.0 or newer, `--max-old-space-size-percentage=75` does the same and follows the limit when it changes.
   Node takes the container's memory limit (cgroup) when there is one, otherwise the machine's memory.
   It wins over `--max-old-space-size` when both are set.
   Check the Node version in the runtime image before you use it.
6. Ask the user to alert on container restarts, and on `OOMKilled` in particular.
   Do not set up a paid monitoring service yourself.

## Verify

1. Build the app with the Makefile target or the `build` script, start it with its dependencies (the project's compose file or a staging environment), and send `SIGTERM`:

   ```bash
   node dist/main.js & PID=$!
   sleep 3; kill -TERM "$PID"; wait "$PID"; echo "exit=$?"
   ```

   Pass: the log shows the shutdown hooks (add a log line to one `onApplicationShutdown` if none logs), and the exit code is `0` with `useProcessExit`, or `143` without it.
2. When Docker is available, build and run the image:

   ```bash
   docker build -t app:shutdown .
   docker run -d --name app-shutdown --env-file .env -p 3000:3000 app:shutdown
   docker exec app-shutdown cat /proc/1/cmdline | tr '\0' ' '
   docker exec app-shutdown id -u
   time docker stop app-shutdown
   docker inspect app-shutdown --format '{{.State.ExitCode}}'
   ```

   Pass: PID 1 is `node` or `tini`, never `npm` or `sh`.
   The user id is not `0`.
   `docker stop` returns well before its 10 second timeout.
   The exit code is `0` or `143`, not `137`.
3. Check the heap limit inside the image with the same `NODE_OPTIONS` and memory limit as production:

   ```bash
   docker run --rm -m 1g -e NODE_OPTIONS=--max-old-space-size=768 app:shutdown \
     node -p "require('node:v8').getHeapStatistics().heap_size_limit / 1048576"
   ```

   Pass: a value a little above 768 (the limit also counts the young generation), and well below 1024.
   In Kubernetes, run the same `node -p` with `kubectl exec deploy/<name> --`.
4. After the next rollout, check the old pods' last state:
   `kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name} {.status.containerStatuses[0].lastState.terminated.reason} {.status.containerStatuses[0].lastState.terminated.exitCode}{"\n"}{end}'`.
   Pass: no `OOMKilled` and no `137`.

## Gotchas

- `npm` and `sh` do not reliably forward signals to Node.
  An entrypoint script must start Node with `exec node ...`.
- The kernel does not apply default signal behaviour to PID 1.
  Nest's handler runs the hooks, then removes itself and sends the signal to its own process again.
  As PID 1, that second signal is ignored, and the process exits only if the event loop is empty.
  Any open timer or socket keeps it alive until `SIGKILL`.
  Kubernetes has no `--init` flag, so use `tini` in the image or `useProcessExit: true`.
- `useProcessExit: true` changes the exit code from `143` to `0`, and async work that other libraries start in their own signal handlers is cut off.
  It also lets async loggers (for example Pino with transports) flush.
- The shutdown order is: the HTTP adapter is marked as closing, `onModuleDestroy`, `beforeApplicationShutdown`, the HTTP server, gateways and microservices close, then `onApplicationShutdown`.
  Requests still run during the first two hooks, so do not close a pool there.
- `@nestjs/typeorm` destroys the `DataSource`, and `@nestjs/bullmq` closes its workers, in `onApplicationShutdown`.
  `worker.close()` waits for the running jobs, and that time counts against the grace period (see `nestjs-connection-draining`).
- `@nestjs/schedule` clears its timers and cron jobs in `beforeApplicationShutdown`, but it does not wait for a cron handler that is already running.
- An error thrown in a shutdown hook is logged, and the process exits with code `1`.
- `app.close()` runs the shutdown sequence but does not end the process.
- `enableShutdownHooks()` adds process listeners for each app.
  Call it in `main.ts` only, not in tests that create many apps, or Node warns about too many listeners.
- `NODE_ENV=production` in the build stage makes `npm ci` skip devDependencies, and `nest build` fails.
  Set it in the runtime stage only.
- `--max-old-space-size` limits only the old generation.
  Buffers, native memory and stacks live outside it, so leave about a quarter of the limit free.
- Exit code 137 means `SIGKILL`.
  `OOMKilled` as the reason means memory.
  Otherwise, after a deploy, it usually means the grace period ran out.
- `SIGTERM` does not work on Windows.

## Related skills

- `nestjs-connection-draining`: the `preStop` delay, `return503OnClosing`, and the time budget that this shutdown must fit in.
- `nestjs-config-validation`: secrets out of the image and `.env*` in `.dockerignore`.
- `nestjs-error-handling`: `--enable-source-maps` in the `CMD`.
- `nestjs-dependency-updates`: a supported Node LTS in the base image, and Nest versions for `useProcessExit`.
- `nestjs-scheduled-jobs`: BullMQ job options and jobs that are safe to run twice.
- `nestjs-observability`: alerts on restarts and `OOMKilled`.
- `nestjs-production-checklist`: runs this check as item 2.
