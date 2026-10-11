# Browser-level tests

These tests are the most real and the most expensive.
Each one costs many CI minutes, and the cost grows when many agents push at the same time.
Keep them few and move checks down when you can.

## Bootstrap test

Each project has one test that runs before the E2E suite.

```typescript
test('bootstrap', () => {
  expect(true).toBe(true);
});
```

The assertion is trivial on purpose.
The test passes only when the app starts and the E2E setup works.
A wrong setup then fails in seconds, not after a 20-minute suite in which every test fails.

Make the suite depend on it, so a failure stops the run.

```typescript
export default defineConfig({
  projects: [
    { name: 'bootstrap', testMatch: 'bootstrap.spec.ts' },
    { name: 'e2e', testIgnore: 'bootstrap.spec.ts', dependencies: ['bootstrap'] },
  ],
});
```

## E2E tests

E2E tests check user stories, and the user stories are the specification.
Cover the key flows of the app and nothing more.

- Before you add an E2E test, go down the list in `SKILL.md`.
  You do not need a browser to check that the legal page mentions cookies.
  An assertion in the code can hold that.
- Convert existing E2E checks into assertions, unit tests, component tests, or integration tests on a regular basis.
- Make tests robust against things that are not the subject of the test.
  A cookie banner or another overlay that covers an element is the usual cause of a false failure.
  Handle it once in shared setup.
- Use role, label, and test id locators with exact assertions.
- Regression tests exist here too, in a separate `*.regression.spec.ts` file.

## Golden tests

A golden test compares a screenshot with a stored image, pixel by pixel.

Use it only when all of these are true:

- The team works from a design, with a designer.
- The design is stable.
- The UI must match the design exactly, and QA capacity is limited.

Do not use it in a project whose design still evolves.
There it slows the team down and gives no value.
Component tests cover most projects.

## Accessibility tests

Almost every project has them.
They are usually one file that runs `axe-core`, or a similar tool, on all pages.

```typescript
import AxeBuilder from '@axe-core/playwright';

for (const path of ['/', '/places', '/legal']) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
```

Accessibility is part of every task unless the task says otherwise.
So this file is part of the local check that runs before each push.

Lighthouse is a second layer.
It finds problems with good practices, the accessibility tree, and accessibility.
It is not required.
A separate CI job that runs it against production once a week is enough.

## Smoke tests

Smoke tests are simple, usually one file.
They only read pages and change nothing.
They run against deployed environments: staging, UAT, and production.
Their purpose is to show that the basic behavior did not degrade after a deployment.

- The Makefile takes the environment as a flag, for example `make smoke ENV=staging`.
- A developer usually runs them by hand after a deployment.
- In CI, use a workflow that a person starts or approves after a good deployment.
  Smoke tests do not start on their own against a live environment.
