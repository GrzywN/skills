---
name: nestjs-production-checklist
license: MIT
description: Runs all 17 NestJS production checks in phases and applies the fixes - config validation, graceful shutdown and container image, connection draining, cron and queue jobs on many replicas, deny-by-default auth, security headers, CORS, rate limits, trust proxy, input validation, response serialization, idempotent writes, dependency updates, outbound timeouts, circuit breakers, migrations, connection pool size, request-scoped chains, error handling, logs, health checks, and monitoring. Each check is an atomic nestjs-* skill, and this skill orders them, collects the decisions for the user, and reports what passed, what changed, and what is left. Use when a NestJS app goes to production, gets more replicas, moves to Kubernetes, or gets a pre-deploy, readiness, or hardening review, also when the user only says "is this ready for prod" or "audit this Nest app".
---

# NestJS production checklist

A Nest app on one dev machine runs as one process, restarts on save, owns its database, and gets requests straight from a browser.
In production it runs as several replicas behind a load balancer, is stopped on each deploy, shares its database, and calls APIs that do not always answer.
Many defaults that are fine for the first setup are wrong for the second.
This skill walks the 17 checks from the post "NestJS Production Checklist: 17 Checks Before You Deploy" by Kamil Mysliwiec, in the order of the post, and applies each one with its atomic skill.

## Checks and skills

| # | Check | Skill | Phase |
| --- | --- | --- | --- |
| 1 | Config is validated at boot, secrets stay out of the image | `nestjs-config-validation` | 1 |
| 2 | SIGTERM reaches Node, shutdown hooks run, image and heap fit the container | `nestjs-graceful-shutdown` | 1 |
| 3 | Pods drain before they close, the grace period covers the longest job | `nestjs-connection-draining` | 1 |
| 4 | Cron runs on one replica, queue jobs retry and are idempotent | `nestjs-scheduled-jobs` | 1 |
| 5 | Authentication is global, every `@Public()` is deliberate | `nestjs-auth-deny-by-default` | 2 |
| 6 | Security headers, CORS origins, rate limits, trust proxy | `nestjs-http-edge-security` | 2 |
| 7 | Every input is validated, lists are bounded, body limit unchanged | `nestjs-input-validation` | 3 |
| 8 | Responses are DTOs or serialized classes, Swagger is not public | `nestjs-response-serialization` | 3 |
| 9 | Writes that must not run twice need an Idempotency-Key | `nestjs-idempotent-writes` | 3 |
| 10 | Node LTS, aligned `@nestjs/*` versions, continuous updates | `nestjs-dependency-updates` | 4 |
| 11 | Every outbound call and query has a timeout | `nestjs-outbound-timeouts` | 4 |
| 12 | Unreliable dependencies have a breaker, bulkhead, or fallback | `nestjs-resilience` | 4 |
| 13 | Migrations run as a deploy step and stay backward compatible | `nestjs-migrations` | 4 |
| 14 | Pool size times peak replicas fits the database | `nestjs-connection-pool` | 4 |
| 15 | No unintended request-scoped chains | `nestjs-request-scope` | 4 |
| 16 | Errors keep statuses and logs, stack traces resolve to source | `nestjs-error-handling` | 5 |
| 17 | Structured logs, liveness without dependencies, monitoring | `nestjs-observability` | 5 |

For each check, load its skill and follow its `Check`, `Apply`, and `Verify` sections.
If a skill is not installed, use the row in this table and the summary at the end of this file as the minimum, and tell the user that the atomic skill is missing.

## Phase 0: Survey and plan

Do this before you change any file.

1. Read the project setup: `Makefile`, `package.json`, the lockfile, `nest-cli.json`, `tsconfig*.json`, `Dockerfile`, `.dockerignore`, deploy manifests (Kubernetes, Helm, Compose, PaaS config), CI workflows, and `src/main.ts` and the root module.
2. Record the stack:
   - Nest version of `@nestjs/core` and `@nestjs/common`, and whether all `@nestjs/*` packages are aligned.
   - HTTP platform: Express or Fastify.
   - ORM and database, validation library, queue, scheduler.
   - Package manager from the lockfile, and the Makefile targets for build, lint, test, and e2e.
   - Deploy target, replica count (also the peak during a rolling deploy and autoscaling), proxies in front of the app, and memory limit.
3. Run the `Check` section of all 17 skills and fill the status table below.
   Mark a row `N/A` only with a reason, for example "no `@nestjs/schedule` and no queue".
4. Collect every decision that belongs to the user in one list and ask once.
   Typical ones: allowed CORS origins, the number of proxies in front of the app, which endpoints must be idempotent, the database `max_connections` and peak replica count, a Nest major upgrade, a shared store (Redis or Postgres) for locks, rate limits, and idempotency, and any paid service or new credentials.
   Do not sign up for a service, add credentials, or spend money without a clear yes.
5. Show the status table and the plan, then start Phase 1.

### Version gate

Some fixes use recent APIs, for example `app.useSecurityHeaders()`, `StandardSchemaValidationPipe`, and `return503OnClosing`.
Each atomic skill names its minimum version and a fallback.
Use the fallback by default.
If the user agrees to upgrade Nest first, run `nestjs-dependency-updates` before Phase 1 instead of in Phase 4, and say that this changes the order of the post.

## Phases

Go through the phases in order.
Inside a phase, go through the checks in the order of the table.

| Phase | Section of the post | Checks |
| --- | --- | --- |
| 1 | Startup and deploys | 1, 2, 3, 4 |
| 2 | The edge | 5, 6 |
| 3 | Input and output | 7, 8, 9 |
| 4 | Dependencies | 10, 11, 12, 13, 14, 15 |
| 5 | Errors and visibility | 16, 17 |

For each check:

1. Run its `Check`.
   If it passes, record the evidence (file and line, or command output) and go to the next check.
2. Run its `Apply`.
   Keep the change to what the check needs.
3. Run its `Verify`.
   A check is done only when the verification ran and passed.
   Reading the code is not verification.
4. Update the status table.

At the end of each phase:

1. Run build, lint, typecheck, unit tests, and e2e tests through the Makefile targets, or the package scripts when there is no Makefile.
2. Fix each failure before the next phase, also a failure that was there before you started.
3. Show the user a short phase summary: the checks that passed, the changes, and open questions.

When you commit, make one commit for each check, so each one can be reviewed and reverted alone.

## Cross-check dependencies

Some checks share a budget or a resource.
Settle them together, not one by one.

- Shutdown time: the `preStop` delay (3), the time Nest needs to close (2), and the longest queue job (4) must fit in `terminationGracePeriodSeconds`.
- Shared store: locks (4), rate limits (6), and idempotency records (9) need storage that all replicas share.
  Reuse one Redis or Postgres when the project has one.
- Retries: the HTTP client (11), resilience presets (12), and the queue (4) can each retry.
  Pick one layer that owns retries, and check that the product of attempts and timeouts fits the caller's budget.
- `@Idempotent()` (9) and `@Retry({ idempotent: true })` (12): register `IdempotencyModule` before `ResilienceModule`.
- Connections: the pool (14) counts every replica, the surge during a deploy, workers, and the migration job (13).
- Global setup: pipes, guards, and interceptors registered in `main.ts` do not reach e2e tests that build their own app.
  Prefer `APP_PIPE`, `APP_GUARD`, `APP_INTERCEPTOR`, and `APP_FILTER` providers (5, 6, 7, 8, 16).
- Source maps: the image (2) and the error handling (16) both need `--enable-source-maps`.
- Health probes: liveness and readiness (17) must not count in latency metrics.
  Kubernetes takes a terminating pod out of its endpoints by itself, so the drain (3) relies on the `preStop` delay, not on the readiness probe.

## Status table

Keep this table up to date and show it at the end.

| # | Check | Status | Evidence or open question |
| --- | --- | --- | --- |
| 1 | Config validation | Pass, Fixed, Needs user, or N/A | `src/app.module.ts:12`, boot fails without `DATABASE_URL` |

Use these statuses:

- `Pass`: it was correct before, with evidence.
- `Fixed`: changed and verified, with the command that proved it.
- `Needs user`: blocked on a decision or on access, with the exact question.
- `N/A`: does not apply, with the reason.

## Final report

1. The status table for all 17 checks.
2. What changed, grouped by phase.
3. What still needs the user, as a list of questions or actions.
4. Packages added or upgraded, with versions.
5. The commands that ran and passed in the last verification.
   Separate what ran from what you assume.

## Summary of the post

Use it as the definition of done.

- Config is validated at boot, required values use `getOrThrow`, secrets come from a secret store, and the config object is never logged.
- `enableShutdownHooks()` is on, Node receives SIGTERM directly, and there is an init process.
  The image is multi-stage, runs as non-root, and the heap limit fits the memory limit of the container.
- Pods drain before closing, and the grace period covers the longest job.
- Scheduled jobs are guarded with `@OnOneInstance()` or `@WithoutOverlapping()` on a shared lock store, and every job is idempotent.
- Authentication is global, and every `@Public()` is deliberate.
- `useSecurityHeaders()` is on, CORS lists its origins, sensitive endpoints are rate-limited, and `trust proxy` matches the number of proxies.
- A global `ValidationPipe` with `whitelist` or a `StandardSchemaValidationPipe` is registered, list endpoints have a maximum page size, and the body limit is unchanged.
- Responses are DTOs or serialized classes, and Swagger is not public.
- Endpoints that must not run twice require an `Idempotency-Key`, backed by a shared store.
- Node is on a supported LTS, `@nestjs/*` packages are current and aligned, and dependency updates arrive continuously.
- Every outbound call and query has a timeout, and retry budgets add up.
- Unreliable dependencies have a circuit breaker, a bulkhead, or a fallback, and one layer owns retries.
- Migrations run as a separate deploy step and are backward compatible, so the previous image can always be redeployed.
- Pool size times peak replica count fits in the database.
- There are no unintended request-scoped chains.
- Error handling keeps statuses and logs, and stack traces resolve to source.
- Logs are structured, liveness does not depend on the database, and the service is monitored.

## Gotchas

- A bug that needs several replicas cannot show on one dev instance.
  Duplicate cron runs, per-process rate limits, in-memory locks, and in-memory idempotency records all look fine locally.
- A rolling deploy runs the old and the new version at the same time, against the same schema and the same pool.
- Do not run the whole checklist as one big diff.
  A phase that breaks the build blocks the review of every check in it.
- Do not mark a check `Pass` because a library is installed.
  Check that it is registered, configured, and covers the routes or jobs that need it.
- Source: https://dev.to/nestjs/nestjs-production-checklist-17-checks-before-you-deploy-1d0j
