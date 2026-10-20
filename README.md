# skills

Agent Skills by Karol Binkowski.
Each skill uses the [Agent Skills](https://agentskills.io) format and works in each agent that supports it.

## Skills

| Skill | What it does |
| --- | --- |
| [testing-pyramid](skills/testing-pyramid/SKILL.md) | A testing approach for agent-native apps: strict runtime contracts, one `assert` function, and tests that state the specification, with E2E kept small. |
| [nestjs-production-checklist](skills/nestjs-production-checklist/SKILL.md) | Runs all 17 NestJS production checks below in phases, applies the fixes, and reports what passed, what changed, and what is left. |
| [nestjs-config-validation](skills/nestjs-config-validation/SKILL.md) | Validates config at boot, reads required values with `getOrThrow`, and keeps secrets out of the image and the logs. |
| [nestjs-graceful-shutdown](skills/nestjs-graceful-shutdown/SKILL.md) | Makes SIGTERM reach Node and run the shutdown hooks, with a multi-stage non-root image and a heap limit that fits the container. |
| [nestjs-connection-draining](skills/nestjs-connection-draining/SKILL.md) | Drains traffic before the server closes and fits the shutdown into the grace period. |
| [nestjs-scheduled-jobs](skills/nestjs-scheduled-jobs/SKILL.md) | Runs cron jobs on one replica with a shared lock store, and makes queue jobs retry safely. |
| [nestjs-auth-deny-by-default](skills/nestjs-auth-deny-by-default/SKILL.md) | Makes authentication global, with explicit `@Public()` opt-outs. |
| [nestjs-http-edge-security](skills/nestjs-http-edge-security/SKILL.md) | Sets security headers, CORS origins, rate limits, and `trust proxy`. |
| [nestjs-input-validation](skills/nestjs-input-validation/SKILL.md) | Registers a global validation pipe, bounds list endpoints, and keeps the body limit. |
| [nestjs-response-serialization](skills/nestjs-response-serialization/SKILL.md) | Returns DTOs or serialized classes instead of entities, and keeps Swagger private. |
| [nestjs-idempotent-writes](skills/nestjs-idempotent-writes/SKILL.md) | Deduplicates client retries with an `Idempotency-Key` and a shared store. |
| [nestjs-dependency-updates](skills/nestjs-dependency-updates/SKILL.md) | Keeps Node on a supported LTS, aligns `@nestjs/*` versions, and sets up continuous updates. |
| [nestjs-outbound-timeouts](skills/nestjs-outbound-timeouts/SKILL.md) | Puts a timeout on each outbound call and query, with a retry budget that adds up. |
| [nestjs-resilience](skills/nestjs-resilience/SKILL.md) | Adds circuit breakers, bulkheads, and fallbacks for dependencies that are down. |
| [nestjs-migrations](skills/nestjs-migrations/SKILL.md) | Runs reviewed, backward compatible migrations as a deploy step. |
| [nestjs-connection-pool](skills/nestjs-connection-pool/SKILL.md) | Sizes the database pool so that all replicas fit, also during a deploy. |
| [nestjs-request-scope](skills/nestjs-request-scope/SKILL.md) | Finds and removes unintended request-scoped provider chains. |
| [nestjs-error-handling](skills/nestjs-error-handling/SKILL.md) | Keeps error statuses and logs, and makes stack traces point at the TypeScript source. |
| [nestjs-observability](skills/nestjs-observability/SKILL.md) | Sets up structured logs, liveness and readiness probes, and monitoring, and helps choose between NestJS Observe, Sentry, an APM, and OpenTelemetry. |

## Install

```bash
npx skills add GrzywN/skills@testing-pyramid
```

The NestJS skills are based on [NestJS Production Checklist: 17 Checks Before You Deploy](https://dev.to/nestjs/nestjs-production-checklist-17-checks-before-you-deploy-1d0j) by Kamil Mysliwiec.
Install the checklist together with the atomic skills, because the checklist loads them:

```bash
npx skills add GrzywN/skills \
  --skill nestjs-production-checklist \
  --skill nestjs-config-validation \
  --skill nestjs-graceful-shutdown \
  --skill nestjs-connection-draining \
  --skill nestjs-scheduled-jobs \
  --skill nestjs-auth-deny-by-default \
  --skill nestjs-http-edge-security \
  --skill nestjs-input-validation \
  --skill nestjs-response-serialization \
  --skill nestjs-idempotent-writes \
  --skill nestjs-dependency-updates \
  --skill nestjs-outbound-timeouts \
  --skill nestjs-resilience \
  --skill nestjs-migrations \
  --skill nestjs-connection-pool \
  --skill nestjs-request-scope \
  --skill nestjs-error-handling \
  --skill nestjs-observability
```

Each atomic skill also works alone.

## Layout

- `skills/<name>/` is a skill.
  This is what you install.
- `evals/<name>/` has the test prompts and the example project for a skill.
  It is not installed.
- `repos/agentskills/` is a copy of the Agent Skills specification, for reference.

## Validate

```bash
make validate
```

This checks each skill against the specification.
It needs Docker.

## License

[MIT](LICENSE)
