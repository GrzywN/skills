---
name: nestjs-dependency-updates
license: MIT
description: Keeps a NestJS app on supported versions - a Node.js LTS line that is Active or Maintenance per the official release schedule (not end-of-life, not a Current line), one Node major in the Dockerfile FROM node:<major>-slim, .nvmrc, engines, CI, and @types/node, base images rebuilt with docker build --pull, aligned @nestjs/* packages (@nestjs/common, @nestjs/core, @nestjs/platform-express or platform-fastify, @nestjs/testing on one version), a committed lockfile installed with npm ci, pnpm install --frozen-lockfile, or yarn install --immutable, Renovate or Dependabot update PRs, and npm audit --omit=dev in CI. Major upgrades of Nest, Node, the ORM, or TypeScript are planned (nest upgrade --dry-run) and confirmed with the user first. Use when the image is FROM node:20, @nestjs versions differ, there is no lockfile, the Dockerfile runs npm install, DI or metadata errors appear after an install, or nobody updates dependencies, also when preparing a NestJS app for production or a deploy.
---

# NestJS dependency updates

Security fixes, memory leak fixes, and bug fixes land only in supported release lines.
An end-of-life Node line gets no security patches at all, and an image built once and run for a year never gets the patches of its own line.
Mismatched `@nestjs/common` and `@nestjs/core` versions cause confusing DI and metadata errors.
Small, continuous upgrades with passing tests are much cheaper than one big upgrade after two years.

## Check

1. Find which Node majors are supported today.
   Do not trust dates from memory or from this file; read the official schedule:

   ```bash
   node --input-type=module -e "
   const schedule = await (await fetch('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json')).json();
   const today = new Date().toISOString().slice(0, 10);
   for (const [line, r] of Object.entries(schedule)) {
     if (r.start > today || r.end <= today) continue;
     const phase = !r.lts || r.lts > today ? 'Current (not LTS)' : r.maintenance > today ? 'Active LTS' : 'Maintenance LTS';
     console.log(line, phase, 'until', r.end);
   }"
   ```

   The same data is in the table at https://github.com/nodejs/Release, and the latest patch of each line is in https://nodejs.org/dist/index.json.
2. Find the Node major the project runs, in every place: `FROM node:` in the `Dockerfile` (every stage), `.nvmrc`, `.node-version`, `.tool-versions`, `engines.node` and `volta` in `package.json`, `node-version` in CI workflows, the PaaS runtime setting, and the `@types/node` major.
   - Pass: one major everywhere, and it is Active LTS or Maintenance LTS in the output of step 1.
   - Fail: an end-of-life line, a Current line in production, `node:latest`, `node:current`, or a floating `node:lts`.
3. Check rebuilds: the base image tag pins the major (`node:24-slim`, optionally with a digest), and a scheduled CI job or Renovate digest PRs rebuild the image with a fresh base.
   Fail: the image is only built on code changes, or without `--pull`.
4. Check `@nestjs/*` alignment.
   Read the installed versions, not only the ranges in `package.json`: `npm ls @nestjs/common @nestjs/core @nestjs/testing @nestjs/platform-express` (`pnpm list`, `yarn why` for other managers).
   - Pass: `@nestjs/common`, `@nestjs/core`, `@nestjs/testing`, and every `@nestjs/platform-*`, `@nestjs/microservices`, and `@nestjs/websockets` resolve to one exact version.
   - Pass: every other `@nestjs/*` package (config, swagger, schedule, typeorm, bullmq, terminus, jwt, throttler, and others) is on a release whose `peerDependencies` cover the installed core major (`npm view @nestjs/swagger peerDependencies`).
   - Fail: `npm ls @nestjs/common --all` shows more than one copy.
   - Compare the core major with `npm view @nestjs/core version` to see whether a newer major exists.
5. Check the lockfile: one of `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock` is tracked (`git ls-files`), and the `Dockerfile` and CI install with the frozen command from the table below.
   Fail: no lockfile, or `npm install` in the `Dockerfile` or CI.
6. Check for update automation: `renovate.json`, `.renovaterc`, `.renovaterc.json`, `.github/renovate.json`, a `renovate` key in `package.json`, or `.github/dependabot.yml`.
7. Check CI for an audit of production dependencies (`audit --omit=dev`, `audit --prod`, `--environment production`).

## Apply

Make each change below its own commit, so a failing test points at one cause.

1. Major upgrades need a plan and a yes from the user.
   This covers a new major of Nest, Node, the ORM (`typeorm` 0.3 to 1.x, Prisma, MikroORM), TypeScript, or any package whose major has a migration guide.
   - Read the official migration guide and changelog for each major (for Nest: https://docs.nestjs.com/migration-guide).
   - For Nest, preview the changes.
     `nest upgrade` (alias `update`, in `@nestjs/cli` 12) upgrades one major at a time from v11 to v12, so run the CLI of the target major: `npx @nestjs/cli@12 upgrade --dry-run --no-observe`.
     Check `--help` of the target CLI for later majors.
     The v12 schematic also raises `typescript` to `^6` and requires Node 20.19+ or 22.12+.
   - Write the plan: current and target versions, breaking changes that touch this code (with file names), the order of steps, and how you will test.
     Show it and wait for confirmation.
   - Always pass `--no-observe`: without it, the upgrade asks to set up `@nestjs/observe`, a hosted service.
     Set up such services only when the user asks.
2. Move Node to a supported LTS line.
   Pick the Active LTS from Check step 1, or the Maintenance LTS if a dependency does not support the Active one yet.
   Never pick a Current line for production, even one that becomes LTS soon.
   Change every place from Check step 2 in one commit: `FROM node:<major>-slim` in all stages, `.nvmrc`, `engines.node`, CI `node-version`, and `@types/node` to `^<major>`.
   If the project is on an end-of-life line, tell the user plainly that it gets no security patches.
3. Align `@nestjs/*` within the current major.
   Find the newest release of the current major with `npm view @nestjs/core@<major> version` (the last line is the highest).
   Install the core packages together at that exact version, with the project's package manager:

   ```bash
   npm install @nestjs/common@<version> @nestjs/core@<version> @nestjs/platform-express@<version>
   npm install -D @nestjs/testing@<version>
   ```

   Then update the other `@nestjs/*` packages to their newest release that supports this major.
   If a package was pinned to an exact older version, look for the reason first (`git log -S '"@nestjs/core"' -- package.json`, comments, issues) and tell the user what you found before you change it.
   If `npm ls @nestjs/common --all` shows a nested copy, update or replace the package that brings it.
4. Commit a lockfile and install from it.
   If there is none, run the project's install once and commit the lockfile it writes.

   | Manager | Lockfile | Frozen install | Production audit |
   | --- | --- | --- | --- |
   | npm | `package-lock.json` | `npm ci` | `npm audit --omit=dev` |
   | pnpm | `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` | `pnpm audit --prod` |
   | Yarn 1 | `yarn.lock` | `yarn install --frozen-lockfile` | `yarn audit --groups dependencies` |
   | Yarn 2+ | `yarn.lock` | `yarn install --immutable` | `yarn npm audit --environment production` |
   | Bun | `bun.lock` | `bun install --frozen-lockfile` | check `bun audit --help` |

   In the `Dockerfile`, copy the manifest and the lockfile first, run the frozen install, then copy the source, so the install layer is cached:

   ```dockerfile
   FROM node:24-slim AS build
   WORKDIR /app
   COPY package.json package-lock.json ./
   RUN npm ci
   COPY . .
   RUN npm run build && npm prune --omit=dev
   ```

   Make sure `.dockerignore` does not exclude the lockfile.
   The rest of the image (runtime stage, `USER node`, exec-form `CMD`) belongs to `nestjs-graceful-shutdown`.
5. Rebuild the image on a schedule.
   Add a weekly schedule trigger to the workflow that builds and pushes the image, and build with `docker build --pull` (`pull: true` in `docker/build-push-action`).
   Use the registry credentials the workflow already has; if it has none, ask the user.
   With Renovate you can instead pin the digest (`node:24-slim@sha256:...`) and get a PR when the base image changes.
6. Add update automation.
   Ask the user which tool to use: Dependabot is built into GitHub, and Renovate needs its app installed or a self-hosted runner.
   Do not install apps or create tokens yourself.
   Renovate, `renovate.json`:

   ```json
   {
     "$schema": "https://docs.renovatebot.com/renovate-schema.json",
     "extends": ["config:recommended"],
     "packageRules": [
       { "matchPackageNames": ["@nestjs/**"], "groupName": "nestjs" }
     ],
     "major": { "dependencyDashboardApproval": true }
   }
   ```

   Dependabot, `.github/dependabot.yml`:

   ```yaml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: /
       schedule:
         interval: weekly
       groups:
         nestjs:
           patterns: ["@nestjs/*"]
     - package-ecosystem: docker
       directory: /
       schedule:
         interval: weekly
     - package-ecosystem: github-actions
       directory: /
       schedule:
         interval: weekly
   ```

   Grouping `@nestjs/*` keeps core packages from drifting apart again.
7. Audit production dependencies in CI, after the frozen install, with the command from the table.
   Ask the team for the threshold; `--audit-level=high` fails only on high and critical findings.
   If the project has no CI config, tell the user and propose one for their CI provider instead of guessing it.

## Verify

1. `rm -rf node_modules && npm ci` (or the frozen command of the project's manager) succeeds: the lockfile matches `package.json`.
2. `npm ls @nestjs/common @nestjs/core @nestjs/testing @nestjs/platform-express` shows one version, and `npm ls @nestjs/common --all` shows no second copy.
   `npm ls` exits 0 (no invalid peers).
3. Run lint, build, unit, and e2e tests on the target Node, inside the target image if you can: `docker run --rm -v "$PWD":/app -w /app node:<major>-slim sh -c "npm ci && npm run build && npm test"`.
   Use the Makefile targets when there are any.
4. Build the image with `docker build --pull -t app:check .`, then `docker run --rm app:check node -v` prints the chosen LTS major.
5. Run the production audit command and report the findings.
   Fix them with in-range updates.
   Do not run `npm audit fix --force`.
6. Validate the bot config: `npx --package renovate -- renovate-config-validator` for Renovate.
   For Dependabot, check that the YAML parses and that GitHub shows no config error after the push.

## Gotchas

- Odd-numbered Node majors never become LTS.
  `node:latest` and `node:current` can give you one, and `node:lts` jumps to a new major on its own when a line is promoted.
- `docker build` reuses a cached base layer.
  Without `--pull`, a weekly rebuild can ship the same old Node patch.
- Peer ranges do not catch drift inside a major: `@nestjs/core` 12.0.1 accepts `@nestjs/common` 12.2.0, so npm installs the mismatched pair without a warning.
  Align them by hand.
- A library that lists `@nestjs/common` or `@nestjs/core` in `dependencies` instead of `peerDependencies` installs a second copy.
  Two copies break `instanceof` checks and DI metadata, often as "Nest can't resolve dependencies".
- Not every `@nestjs/*` package shares the core version number (`@nestjs/throttler` is on 6.x, some new packages are 0.x).
  Aligned means their peer range covers your core major.
- `npm install` rewrites the lockfile when ranges allow newer versions, so CI tests something other than what is committed.
  `npm ci` fails instead.
- `npm audit fix --force` can install breaking majors.
  Treat it like a major upgrade.
- An `@types/node` major above the runtime lets code use APIs the runtime lacks; one far below hides new ones.
- If the `Dockerfile` uses `corepack enable`, check that `corepack --version` works in the new base image before you rely on it.
- Some fixes in sibling skills need recent releases (`useSecurityHeaders()`, `StandardSchemaValidationPipe`, `return503OnClosing`).
  Align versions first, then apply them.

## Related skills

- `nestjs-graceful-shutdown`: the rest of the `Dockerfile` (multi-stage, non-root, exec-form `CMD`, heap limit).
- `nestjs-migrations`: ORM majors change migration commands and generated SQL.
- `nestjs-http-edge-security`, `nestjs-input-validation`, `nestjs-connection-draining`: their newest APIs need a current Nest minor.
- `nestjs-production-checklist`: runs this check in phase 4 with the other dependency checks.
