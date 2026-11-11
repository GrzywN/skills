# More than one model in one system

The facts are from [Which Claude model should you build with?](https://claude.dev/blog/which-claude-model-should-you-build-with/), published on 2026-11-09.

There are four ways to mix models.
Pick the one that fits the shape of the work.

| The work | Pattern |
| --- | --- |
| One main thread with side tasks: search, logs, summaries | Subagents on smaller models |
| The task changed, and the current model is too small or too big for the rest | Switch the model at a natural break |
| Most turns are routine, and a few need a stronger model | An advisor, after you measure it |
| Bigger than one context window, and it splits into independent pieces | A lead with cheaper workers |

Keep a setup with more than one model only if it beats every single-model setup on score against spend, on your own tasks.

## Subagents on smaller models

A subagent runs in its own context window and returns a summary.
Its tokens bill at the rates of the model that it runs on.

- In Claude Code, set `model: haiku` or `model: sonnet` in the definition of the subagent.
- `CLAUDE_CODE_SUBAGENT_MODEL` sets the default for subagents that have no model.
  A model in the definition, or a model given when the subagent starts, takes precedence.

Save this as `.claude/agents/log-reader.md`:

```markdown
---
name: log-reader
description: Reads test output and logs, and reports each failing case. Use after a test run.
tools: Read, Grep, Glob, Bash
model: haiku
---

Read the logs you're given. For each failure, report the file, the test name and the first error line. Don't edit any files.
```

The rule for the model of a subagent:

- A mistake that is cheap to spot goes to a small model: find files, run tests, read logs.
  Start on Haiku 5.5.
- A small model that misreads a search result is not free: the main model opens the wrong file and spends tokens on it.
  When you see that happen, move the subagent to Sonnet 5.5.
- A code edit or a judgment call stays on the main model.
  A subagent that edits code inherits the model of the session, with `model: inherit`.
  Put it on a smaller model only for well-scoped work with a test that checks the result, never on Haiku 5.5, and measure it first.

Three facts about Claude Code change what a definition does:

- The built-in Explore subagent runs on the model of the session, and not always on Haiku.
  On the Claude API, that model is capped at Opus.
  To keep exploration cheap, define your own subagent with the name `Explore` and `model: haiku`.
- On the Anthropic API, the `haiku` alias resolves to Haiku 5.5, and this needs Claude Code v2.1.293 or later.
  On Amazon Bedrock, Google Cloud, Microsoft Foundry and Claude Platform on AWS, it still resolves to Haiku 4.5.
  `ANTHROPIC_DEFAULT_HAIKU_MODEL` pins the model that the alias uses.
- The `opusplan` alias plans with Opus in plan mode, and then carries out the plan with Sonnet.
  That puts the code edits on Sonnet, which is the reverse of the rule above.
  Measure `opusplan` on your own tasks before you make it the default.

## Switch at a natural break

Two things are lost when a session changes its model: the cache, and sometimes the reasoning.

The prompt cache belongs to the model that wrote it.
The first turn on a new model pays the cache-write price on the whole conversation.
Make that turn smaller:

- In Claude Code, run `/compact` first, or start a new session with a short written plan.
- On the API, open the conversation of the new model with a summary of the work so far, not with the full history.

Each thinking block records the model that produced it, and a model reads the blocks of only some other models.

| Model | Reads the thinking blocks of |
| --- | --- |
| Fable 5.2 | Opus 5.5, Sonnet 5.5, Haiku 5.5 |
| Opus 5.5 | Sonnet 5.5, Haiku 5.5 |
| Sonnet 5.5 | Haiku 5.5 |

This table holds on the Claude API and on Claude Models on Google Cloud (Google managed).

- A model never reads the blocks of a model above it, so a move down a tier loses the earlier reasoning.
- A move from Fable 5.2 to any other generally available model drops its reasoning.
- When the new model cannot read the blocks, the API drops them and the request still succeeds.
  The new model then works without that reasoning.

So a good moment to switch is after a plan is written down, after a commit, or between two tasks.
A bad moment is the middle of a debugging session, where the reasoning is the state.

## An advisor for hard decisions

The advisor tool is in beta.
It pairs a faster, cheaper executor model with a stronger advisor model.
The executor runs the task and can ask the advisor for guidance partway through.
Most of the tokens bill at the rate of the executor.

The advisor helps only when it adds capability that the executor does not have, and only when the executor asks.
An executor asks less often at low effort.

- It can pay off on agentic work where most turns are routine.
- The cost guide of the platform is cautious: of the four pairings in its advisor table, none clearly beat its executor alone.
- One of those pairings was an Opus 5.5 executor at `high` with a Fable 5.1 advisor, on an internal coding benchmark.
  It scored 90.1% at $2.92 per attempt.
  That is 1.7 points over Opus 5.5 alone at `high`, for about 2.1 times the money.
  A gain of that size is at the edge of run-to-run noise, and about what a higher effort level buys.

Before you add an advisor:

1. Measure how often the executor asks for advice.
2. Check which advisors the executor accepts.
   A Sonnet 5.5 executor accepts Fable 5.2, Opus 5.5, Opus 5 and Sonnet 5.5.
   A Fable 5.2 executor accepts only Fable 5.2 or Mythos 5.2.
3. Compare the pairing with the executor alone at one effort level higher.

## A lead with cheaper workers

This pattern is for work that is bigger than one context window.
A top-tier model leads, splits the task, gives the pieces to many cheaper workers in parallel, and merges the results.

On an internal defect-search benchmark over about 22 million tokens of source code, an Opus 5.5 lead over Sonnet 5.5 workers, up to 25 at a time, cost about a third less than Opus 5.5 alone at its default effort.
It scored about the same.

On the Claude Platform, multiagent orchestration in Claude Managed Agents gives a coordinator agent and a roster of workers.

Do not use this pattern for one chain of dependent steps, or for work that fits in one context window.
There, the planning and the merging cost more than they save.
