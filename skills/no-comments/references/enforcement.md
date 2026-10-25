# Enforcement points

The user chooses the enforcement points in step 2 of the workflow.
Each point runs the same detector with the same flags, so a result is the same everywhere.
The examples use the bundled script with `origin/main` as the base.
Use the project's real default branch, and its own commands when it has them.

## Makefile and CI

Add one target.
If the project already has an architecture test target, add the check to it, so `make test` and CI run it with no new step to remember.

```makefile
no-comments:
	node scripts/no-comments/no-comments.ts --mode ratchet --base origin/main
```

In CI, ratchet mode needs the git history to find the merge base.
With GitHub Actions, check out with `fetch-depth: 0`, and on a pull request compare with the target branch:

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
- run: node scripts/no-comments/no-comments.ts --mode ratchet --base "origin/${{ github.base_ref || 'main' }}"
```

Zero mode needs no history and no base.

## Agent hook

A hook after each edit shows the agent its new comment at once, not later in CI.
For Claude Code, add this to the project's `.claude/settings.json`, next to the hooks that are already there:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | { read -r file; cd \"$(dirname \"$file\")\" && [ \"$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)\" = \"$(git -C \"$CLAUDE_PROJECT_DIR\" rev-parse --path-format=absolute --git-common-dir)\" ] || exit 0; node \"$CLAUDE_PROJECT_DIR/scripts/no-comments/no-comments.ts\" --mode ratchet --base origin/main \"$file\"; } 1>&2 || exit 2"
          }
        ]
      }
    ]
  }
}
```

Exit code 2 sends the report back to the agent.
Add the same `--exclude` flags as in the Makefile, so that the hook skips the same paths.
The hook checks only the edited file, so old comments in other files do not block each edit.
It runs git from the folder of the file, so a file in another worktree of the project is checked against its own worktree.
A file outside the project's repository passes.
The command needs `jq`.
For another agent, use its hook after a file edit, with the same command.

## Git pre-commit

Use the hook manager the project already has.
Do not add a hook manager without asking the user, because it is a new dependency for each developer.

Lefthook passes only the staged files that match, and skips the command when there are none:

```yaml
pre-commit:
  commands:
    no-comments:
      glob: "*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,html,htm,css}"
      run: node scripts/no-comments/no-comments.ts --mode ratchet --base origin/main {staged_files}
```

With Husky, give the script the staged files, and run nothing when the list is empty.
Without file arguments the script checks the whole repository.

The script reads the working tree, not the staged version of a file.

## With eslint-plugin-no-comments

The plugin checks whole files, so ratchet mode runs it only on the files that changed against the merge base:

```makefile
no-comments:
	base=$$(git merge-base origin/main HEAD) && git diff -z --name-only --diff-filter=ACMR "$$base" -- '*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.jsx' '*.mjs' '*.cjs' | xargs -0 -r npx eslint
```

Each changed file must then be free of comments at once, also the old ones.
A new file that is not yet added to git is not in that list, so it is checked after `git add`.
The agent hook runs `npx eslint "$file"`, and Lefthook runs `npx eslint {staged_files}`.
Zero mode is `npx eslint .`.

## AGENTS.md or CLAUDE.md

Add one line to the rules that every session reads, and link the rule page:

```markdown
- No comments in code: put intent in names, `assert` and test names, and put decisions, pitfalls, workarounds and external facts in `docs/` (checked by `<the command that runs the check>`, see `docs/no-comments.md`).
```

## Rule page in docs

Add a short page to the project's `docs/` in pull request 1.
It says what stays (the list in `SKILL.md`), where the knowledge goes (the five places), and the command that checks it.
Keep it short: the gate enforces the rule, the page only explains it.

## Switch to zero

In the cleanup pull request, after the last comment is gone, remove `--mode ratchet --base ...` from every enforcement point.
Zero is the default mode.
Search the repository for `--mode ratchet` and `merge-base`, and make sure that no enforcement point still uses ratchet mode.
With eslint-plugin-no-comments, replace the changed-files recipe with `npx eslint .`.
