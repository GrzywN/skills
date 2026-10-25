---
name: testing-pyramid
license: MIT
description: Testing approach for agent-native apps. Strict zod contracts on each request and response, one runtime assert function, failures reported to Sentry, Storybook component tests, property-based and table-driven unit tests, endpoint-named integration tests, lean E2E, accessibility, smoke, and manual checklists. Use when you write, review, plan, or delete tests, add an endpoint, consume an API, fix a bug (regression test rules), set up a test stack or CI, or decide which type of test a requirement needs, also when the user does not say "testing pyramid".
---

# Testing pyramid

Agents write code in parallel, so CI minutes are the scarce resource.
This pyramid puts each requirement in the cheapest place that can hold it.
The cheapest place is the code itself.
A schema or an assertion costs no CI time, sits next to the code it guards, and fails loudly when it goes out of date.

## Layers

The widest layer is first.
Prefer a layer that is higher in this table.

| Layer | What it holds | Detail |
| --- | --- | --- |
| Runtime contracts | The shape of each request and response | `references/runtime.md` |
| Runtime assertions | Assumptions and data ranges, inside the code | `references/runtime.md` |
| Performance monitors | Time budgets on critical paths, as warnings | `references/runtime.md` |
| Component tests | Behavior of one UI component, in Storybook | `references/spec-tests.md` |
| Unit tests | Specification of shared logic | `references/spec-tests.md` |
| Integration tests | Each endpoint and each status | `references/spec-tests.md` |
| Bootstrap test | The app starts and the E2E setup works | `references/e2e.md` |
| E2E tests | Key user stories | `references/e2e.md` |
| Accessibility and smoke tests | One file each, for all pages | `references/e2e.md` |
| Architecture tests | Rules for the whole repository | `references/beyond-automation.md` |
| Manual tests | Stories that automation cannot cover | `references/beyond-automation.md` |
| Real users | Feedback, audit trail, visible version | `references/beyond-automation.md` |
| Documentation | The last option | `references/beyond-automation.md` |

Assertions are the most numerous check.
Component tests and unit tests are equal and come next.
E2E tests are few.

Every project gets contracts and the `assert` function.
A project with E2E tests gets the bootstrap test.
A project with UI gets the accessibility file and Storybook.
Add golden tests, architecture tests, and Lighthouse only on the conditions in the references.

## Where does a requirement go

Go down this list and stop at the first place that can hold the requirement.

1. A strict schema at a boundary.
2. An `assert` in the code that has the requirement.
3. A component test or a unit test that states the specification.
4. An integration test with the endpoint and the status in its name.
5. An E2E test, only for a key user story.
6. A manual checklist item, only when automation is not possible.
7. Documentation, only when nothing above can hold it.

When you touch an E2E test, ask if a lower place can hold the same check, and move it there.

## Rules

### Validate, do not cast

Do not write `as` casts.
A cast hides an assumption, and a schema or an assertion checks it.
`as const` and `satisfies` are not casts and stay allowed.
Enforce the rule with `@typescript-eslint/consistent-type-assertions` set to `assertionStyle: "never"`.

Parse each request and each response with a zod schema that is as strict as you can make it.
A failure is better than a success with wrong data.

### One assert function

Each project has this function in its shared utilities, in `assert.ts`.
Use only this function.
Do not add variants for null checks or other cases.

```typescript
export function assert(condition: boolean, why: string): asserts condition {
  if (!condition) {
    throw new Error(why);
  }
}
```

Use it in constructors and key functions to state the data range that the code supports.
Write `why` as the domain requirement, because it is the documentation.
Prefer an assertion to a comment, to documentation, and to a unit test that checks a trivial thing.

### Failures reach error reporting

Each assertion failure, and each contract failure on data that comes in from an API, must reach the error reporting service, for example Sentry, with its full stack trace.
A bad request from a client is not such a failure.
Answer it with a 400 and do not report it, because anyone can send bad requests.
`assert` only throws, and the global handlers report.
So do not catch an error and drop it.
If you must catch one, report it or throw it again with `cause`.

A performance check is different.
It sends a warning and never stops the user or CI.

### Tests state the specification

- Test what the code must do, not how it does it.
  Change one condition in the code.
  If no test fails, the tests check the implementation and not the specification.
- Use property-based tests with `fast-check` instead of single example values.
  Take the ranges from the assertions in the code.
- Use table-driven tests for similar cases: `it.each` with an inline array.
  A project that declares another style wins.
- Do not use mocks.
  Use MSW for HTTP, testcontainers for services, and a fake that implements the same interface.
- Make everything injectable, constants included, with the real value as the default.

### Regression tests

A specification test says what the system must do.
A regression test guards against a defect that happened.
Keep them in separate files: `places.spec.ts` and `places.regression.spec.ts`.

Put this comment above each regression `describe`, `test`, or `it`:

```typescript
// regression: PROJ-249: Place marker shows when it must be hidden on region selection
test('place marker hides again after returning to the default view', async ({ page }) => {
  // ...
});
```

The format is `// regression: <exact issue key>: <exact issue title>`.
Read the key and the title from the issue tracker, for example Jira, before you write the comment.
If you cannot read them, ask the user.
Do not write the title from memory, because a wrong title sends the next reader to the wrong issue.
Add the comment also when the project forbids comments.
The `no-comments` skill allows this line, so do not add an ignore for it.
If the project checks comments with another tool, add `regression:` to the allowlist of that tool.

## Gotchas

- `test.todo` takes only a name.
  Jest fails when it gets a callback.
- If the test file for your own utility grows above 200 lines, look for a proven package.
  Distance on a sphere and HTML sanitization are typical cases.
- An E2E test that fails because a cookie banner covers a button tests the wrong thing.
  Close such overlays in shared setup.
- Do not add golden screenshot tests to a project whose design still changes.
- Do not write an ADR in a project that has none.
  The code shows the current state and git history records the decisions.
  A decision that the code cannot show goes to `docs/`.

## Read next

- You change production code, an endpoint, or an API client: read `references/runtime.md`.
- You write a component, unit, integration, or regression test: read `references/spec-tests.md`.
- You write or change a test that opens a browser or runs against a deployed environment: read `references/e2e.md`.
- You add a repository rule, plan manual tests, handle user feedback, or want to write documentation: read `references/beyond-automation.md`.
