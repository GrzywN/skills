---
name: no-comments
license: MIT
description: Removes comments from a codebase and adds a CLI gate that stops new ones, first as a ratchet on new comment lines, then at zero. Knowledge that the code cannot show (decisions, pitfalls, workarounds, facts about external systems) moves to docs/, intent moves to names, assertions and test names. Ships a tested detector for TS/JS, HTML and CSS (oxc-parser, parse5, postcss), and offers eslint-plugin-no-comments or Oxlint as alternatives. Use when the user wants to remove, ban or stop comments, asks for self-documenting or clean code (Uncle Bob), when agent diffs reword comments in many files, when HTML comments leak to users in the browser, when you review a diff that adds comments, or when you write code in a project that has a no-comments gate, also when the user does not say "no-comments".
---

# No comments

Code documents itself through names, types, assertions and tests.
A comment is a second copy of that knowledge, and nothing checks that the copy stays true.

- A comment goes out of date when a person changes the code next to it.
- An agent rewords comments it did not need to touch, so a small change becomes a diff of many files that nobody can review.
- Most comments repeat the code, and still need upkeep.
- An HTML comment ships to each user and shows internal know-how in the browser.
- Most new comments come from agents, not from people.

This skill is the comment rule from the "Architecture tests" layer of the `testing-pyramid` skill.
The `assert(condition, why)` function from that skill is the main replacement for a comment.
If the project has no such function, add this one to its shared utilities:

```typescript
export function assert(condition: boolean, why: string): asserts condition {
  if (!condition) {
    throw new Error(why);
  }
}
```

## What stays

The gate allows only comments that a tool reads, that the law needs, or that `testing-pyramid` requires:

- Tool directives, with their reason text.
  For example `biome-ignore`, `eslint-disable`, `oxlint-disable`, `stylelint-disable`, `prettier-ignore`, `@ts-expect-error`, `@vitest-environment`, `@jest-environment`, `v8 ignore`, `@vite-ignore`, `webpackChunkName`, `@__PURE__`, `@jsxImportSource`, `# sourceMappingURL=`.
  The full list is `DIRECTIVE_PREFIXES` in `scripts/no-comments.ts`.
- `// regression: <issue key>: <issue title>` above a regression test, as `testing-pyramid` requires.
- A license header: `/*!`, `@license`, `@preserve`.
- A TypeScript triple-slash reference: `/// <reference ... />`.
- JSDoc directly above a top-level export, only in a published library whose API docs are generated from JSDoc.

All other comments go.

## Where the knowledge of a comment goes

Go down this list and stop at the first place that can hold the knowledge.

1. Nowhere: the comment repeats the code.
   Delete it.
2. A name: a variable, a function, a constant, a type.
3. A schema or `assert(condition, why)`: the `why` is documentation that runs.
4. A test name that states the specification.
5. `docs/`: knowledge that a reader cannot get from the code.
   A decision that is not clear at first look, a pitfall, a workaround, an odd choice and its reason, a fact about an external system.
   If the project has ADRs, a decision goes to an ADR.

When you are not sure if a comment holds such knowledge, move it to `docs/`.
Do not delete it.
A deleted fact is lost, and a doc can be pruned later.

If a doc needs a paragraph to justify a workaround, tell the user, because the code can probably be fixed.

## Workflow

### 1. Take an inventory

Find what the project already has before you add anything:

- The file types with code: TS/JS, HTML, CSS, and others such as Vue, Svelte or Astro.
- The linter (Biome, ESLint, Oxlint), the test runner, the package manager and its install rules, for example a pnpm `trustPolicy`.
- The `Makefile` or task runner, the architecture tests, the CI workflow, the git hook manager, `AGENTS.md` or `CLAUDE.md`, and the `docs/` layout.
- A comment check that exists already.
  Extend it, and do not add a second one.
- A git repository and its default branch.
  The bundled script needs git, and ratchet mode needs the base branch.
  In a repository with no remote, use the local default branch, for example `--base main`.

Estimate the number of comments per file type and per directory, and change nothing yet.
A read-only search is enough, for example `git grep -c -E '^\s*(//|/\*|\*|<!--)'`.
The detector gives the exact count after you install it in step 3.

### 2. Ask the user

Ask these three questions together, each with the recommended option first, and wait for the answers.
Do not choose in silence, because each answer changes the work.
Ask only the questions that the request does not answer.
A request for only the gate, or only the cleanup, skips the questions of the other step.

1. **Detector.**
   The bundled script (recommended: TS/JS, HTML and CSS, ratchet and zero mode), `eslint-plugin-no-comments` in ESLint or Oxlint (JS/TS only, has `--fix`), or the tool the project already has.
2. **Cleanup mode.**
   Triage (recommended: each comment goes to its place in the list above), or fast (delete what has no knowledge, move each other comment to `docs/` as it is).
   No mode deletes a decision, a pitfall or a workaround.
3. **Enforcement points**, more than one is allowed.
   `Makefile` and CI (recommended), an agent hook after each edit, a git pre-commit hook, and a line in `AGENTS.md` or `CLAUDE.md`.

### 3. Pull request 1: the gate in ratchet mode

Install the detector and the chosen enforcement points in ratchet mode.
Ratchet mode fails only on comments that are new against the base branch, so the old comments do not block the work.
Add a short rule page in `docs/` that says what stays and where the knowledge goes.

Skip this step when the project has no comments, and install the gate in zero mode at once.

Read `references/detectors.md` and `references/enforcement.md`.

### 4. Pull request 2: the cleanup

Remove the comments in the chosen mode, then switch every enforcement point to zero mode in the same pull request.
The diff has only deleted comments, renames, assertions, test names, new or changed docs, and the changes to the enforcement points.

Read `references/cleanup.md`.

### 5. New code in a project with the gate

- Write no comment.
  Put the intent in a name, an `assert`, or a test name.
- Put a decision, a pitfall, a workaround or an external fact in `docs/`, next to the topic it belongs to.
- When the gate fails, do not add the comment text to `--allow`.
  Move the knowledge to its place in the list above.

## Gotchas

- In ratchet mode an edited comment counts as new.
  Do not reword a stale comment: delete it, or move it to `docs/`.
- Do not "improve" comments in files that your task does not touch.
  That is the diff of many files that this skill exists to stop.
- An HTML comment ships to the user even when the JS bundle is minified.
- Commented-out code is never knowledge.
  Git keeps the old version, so delete it.
- A `TODO` is a task, not a comment.
  List each `TODO`, and ask the user in one question which ones go to the issue tracker.
  Keep them until the user answers, then delete them.
- A comment inside a CSS selector or value, and a comment inside an HTML attribute, are not found by the bundled script.
  They are rare, so remove them when you see them.
- Exclude vendored and generated files with `--exclude`, because nobody in the project can change them.
- Do not delete knowledge from a doc to make it shorter.
  When a doc grows too long, split it into focused files.

## Read next

- You set up the detector: read `references/detectors.md`.
- You add the gate to the Makefile, CI, an agent hook, a git hook or `AGENTS.md`: read `references/enforcement.md`.
- You remove existing comments: read `references/cleanup.md`.
