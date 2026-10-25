# Cleanup

The user chooses the cleanup mode in step 2 of the workflow.
Both modes keep each decision, pitfall, workaround and external fact.
No mode deletes such knowledge.

## Modes

**Triage** (recommended).
Each comment goes to the first place in the list from `SKILL.md` that can hold it: nowhere, a name, an assertion, a test name, or `docs/`.
This takes longer and gives the best code.

**Fast.**
Delete each comment that the table below marks "Delete", and handle each `TODO` as the table says.
Move each other comment to `docs/` as it is, with the file and the symbol it was about.
No renames and no new assertions.
Use it when the user wants a small, safe diff now and better names later.

## Classify a comment

| The comment | What to do |
| --- | --- |
| Repeats the code: `// increment the counter`, `/** The user id. */` | Delete |
| Marks a section: `// Helpers`, `<!-- Header -->`, `/* Buttons */` | Delete it, and suggest a file split or a semantic element to the user as a later change |
| Commented-out code | Delete it, because git has the old version |
| `TODO`, `FIXME` | Keep them until the user says in one answer which ones go to the issue tracker, then delete them |
| Explains what a value means: `// in seconds` | Rename: `timeoutSeconds` |
| States a range or an invariant: `// never empty here` | `assert(items.length > 0, 'a route has at least one stop')` |
| Explains expected behavior | A test whose name states it |
| A decision, a pitfall, a workaround, an odd choice, a fact about an external system | Move to `docs/` |
| Not sure | Move to `docs/` |

Text that a tool reads stays: see "What stays" in `SKILL.md`.
If the tool reports a directive as unused, ask the user before you delete it.

## Write to docs

- Put each fact next to the topic it belongs to, in the docs structure the project already has.
  For example, a fact about a consent banner goes to the consent docs.
- Name the code it is about by file and symbol, not by line number, because line numbers change.
- One sentence per line.
- Do not repeat what the code shows.
  Keep only the reason, the risk, or the external fact.
- If a doc needs a paragraph to justify a workaround, tell the user, because the code can probably be fixed.

## Split the work

A cleanup of a large codebase is many small, independent changes.
If your agent can run sub-agents, give each one a directory that does not overlap with the others, for example `frontend/scripts`, `frontend/prerender`, `backend`, `e2e`, and the HTML and CSS files.

Give each sub-agent the same brief:

- The cleanup mode and the classification table above.
- Change only comments, and the names, assertions and tests that replace them.
  Do not refactor other code.
- Return a list of each fact that moved to `docs/`, with its source file and its target doc.

Merge the docs changes yourself, so that two sub-agents do not write the same doc.

## Make it reviewable

- One commit per area, so a reviewer can read one area at a time.
- A rename changes each use of the name.
  Use the language server or the IDE rename, not text search and replace.
- The pull request body has a table of each fact that moved: source file, target doc.
  The reviewer checks that list, and does not need to read each deleted line.
- In the same pull request, switch each enforcement point to zero mode: see `references/enforcement.md`.

## Done when

- The gate passes in zero mode.
  If there is no gate yet, copy the bundled script into a temporary folder outside the project, with a `package.json` of `{ "type": "module" }` and the dependencies.
  Run it in zero mode with the project folder as the working directory, for example `node /tmp/no-comments/no-comments.ts`.
  The search from step 1 of `SKILL.md` is not enough, because it does not find a comment at the end of a line.
- Lint, typecheck, tests and build pass.
- The diff has only deleted comments, renames, assertions, test names, new or changed docs, and the changes to the enforcement points.
- Each fact in the pull request table is in its target doc.
