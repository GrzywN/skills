# Detectors

The user chooses the detector in step 2 of the workflow.
This file shows how to set up each option.

| | Bundled script | `eslint-plugin-no-comments` | Tool the project has |
| --- | --- | --- | --- |
| TS/JS | yes | yes | depends |
| HTML, CSS | yes | no | depends |
| Ratchet on new comments | yes | no, only per file | depends |
| Removes comments with `--fix` | no | yes | depends |
| New tools in a Biome project | 3 parsers | ESLint with `@typescript-eslint/parser`, or Oxlint | none |

## Bundled script

`scripts/no-comments.ts` finds comments with real parsers, never with a regex:

- TS, TSX, MTS, CTS, JS, JSX, MJS, CJS: `oxc-parser`.
- HTML: `parse5`, with inline `<script>` and `<style>` sent to the JS and CSS parsers.
  JSON-LD and other data scripts are skipped.
- CSS: `postcss`.

A file that does not parse stops the check with an error, so no comment is missed in silence.

### Install

1. Copy `scripts/no-comments.ts` and `scripts/no-comments.spec.ts` into a folder of their own, for example `scripts/no-comments/`.
   Add two files to that folder, because both scripts are ES modules:
   - `package.json` with `{ "type": "module" }`,
   - `tsconfig.json` with `module` set to `nodenext`, `allowImportingTsExtensions`, `noEmit` and `types: ["node"]`.
2. Add the dev dependencies with exact versions, through the project's package manager and its install rules:
   `oxc-parser`, `parse5`, `postcss`, `fast-check`.
   `oxc-parser` loads a prebuilt binary from an optional dependency, and needs Node `^20.19.0 || >=22.12.0`.
   If a trust policy of the package manager stops the install, tell the user.
3. Run the spec with `node --test scripts/no-comments/no-comments.spec.ts`, from the target that runs the project's tests.
   Keep it on `node:test`.
4. Keep the folder out of the project's own tools, because they expect other settings:
   - every `tsconfig` that the typecheck or the build uses, also one that sets its own `exclude`, such as `tsconfig.build.json`,
   - the Vitest or Jest test collection, for example `test.exclude` or `testPathIgnorePatterns`.
   The folder's own `tsconfig.json` lets the lint and a type-aware typescript-eslint still read both files.
5. The script runs with Node type stripping: `node scripts/no-comments/no-comments.ts`.
   Node 22.18 or later does this without a flag.
   With an older Node, run it with the project's TS runner, for example `tsx`.

### Use

```bash
node scripts/no-comments/no-comments.ts                                   # zero mode, all tracked and untracked files
node scripts/no-comments/no-comments.ts --mode ratchet --base origin/main # only comments that are new against the merge base
node scripts/no-comments/no-comments.ts src/a.ts src/b.html               # only these files, for hooks
```

- `--exclude <glob>` skips a path, from the repository root, for example `--exclude '**/vendor/**'`.
  Repeat it for each path.
  It applies also to the files you give on the command line.
- `--allow <prefix>` allows one more tool directive, for example `--allow fallow-ignore`.
  Never add prose here.
- `--allow-exported-jsdoc` allows JSDoc directly above a top-level export.
  Use it only in a published library.

The script works from any directory in the repository.
The exit code is 0 when clean, 1 when it finds comments, and 2 on a usage error, a git error, or a file that does not parse.

Ratchet mode compares, for each changed file, the comments in the merge-base version with the comments in the current file.
A comment that only moved is not new.
A comment with changed text is new.
A renamed file keeps its old comments when git sees the rename.
That is after `git mv` or `git add`, and only while the file keeps most of its old content.
A file that moves out of an excluded path counts as new.

### Other file types

For Vue, Svelte or Astro, extract the `<script>` and `<style>` blocks the same way the HTML branch does.
Add a test case for each type.
For YAML, shell or SQL, ask the user first.
These files often need comments for tools, for example Drizzle `--> statement-breakpoint`.

## `eslint-plugin-no-comments`

One rule, `no-comments/disallowComments`, that reports each comment and removes it with `--fix`.
It checks JS and TS only.

ESLint flat config.
ESLint checks only JS files unless a config names the other types, so this config adds the TypeScript parser (`@typescript-eslint/parser`).
The `allow` list keeps nearly the same comments as the bundled script:

```js
import tsParser from '@typescript-eslint/parser';
import noComments from 'eslint-plugin-no-comments';

const allow = [
  'eslint-',
  'oxlint-',
  'stylelint-',
  'biome-ignore',
  'prettier-ignore',
  '@ts-',
  '@vitest-environment',
  '@jest-environment',
  '(?:istanbul|c8|v8) ignore',
  '@vite-ignore',
  'webpack(?:ChunkName|Mode|Prefetch|Preload|FetchPriority|Ignore|Include|Exclude|Exports)',
  '[@#]__PURE__',
  '@__NO_SIDE_EFFECTS__',
  '@jsx',
  '# sourceMappingURL=',
  '!',
  '@license',
  '@preserve',
  '\\*[\\s*]*@(?:license|preserve|vitest-environment|jest-environment|jsx)',
  'regression: \\S+: \\S',
  '/ ?<reference',
];

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'no-comments': noComments },
    rules: { 'no-comments/disallowComments': ['error', { allow }] },
  },
];
```

Oxlint loads it as a JS plugin in `.oxlintrc.json`, and it parses TS without extra setup.
JS plugins are in alpha in Oxlint, so pin the Oxlint version.
Put the full `allow` list from the ESLint example into the JSON, because JSON cannot import it:

```json
{
  "jsPlugins": ["eslint-plugin-no-comments"],
  "rules": { "no-comments/disallowComments": ["error", { "allow": ["<the full list from the ESLint example>"] }] }
}
```

Know its limits before you offer it:

- `allow` replaces the defaults (`eslint` and `global`).
  The list above uses `eslint-`, so prose that starts with "eslint" stays blocked.
- Each entry goes into a regular expression without escaping, and it matches the start of the comment text after `//` or `/*`.
  So `/// <reference` is `/ <reference`, a `/*!` header is `!`, and a `/** @license` block needs `\*[\s*]*@license`.
- The match allows only one space after `//` or `/*`.
  A directive with more spaces, or a line comment that starts with `!`, is treated differently than in the bundled script.
- Enforcement needs other commands than the bundled script: see "With eslint-plugin-no-comments" in `references/enforcement.md`.
- It has no ratchet on new lines.
  A ratchet runs it only on changed files, so each changed file must be clean at once.
- HTML and CSS need the bundled script, or stay without a check.
  Tell the user which of the two you chose.
- `--fix` deletes every comment.
  Run the cleanup triage first, and use `--fix` only for what is left to delete.

## Tool the project has

If the project already has a comment check, for example a script like the one in this skill, extend it with the missing file types and allowlist entries.
Do not add a second check that reports the same comments.
