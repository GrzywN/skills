---
name: model-selection
license: MIT
description: Picks the Claude model and the effort level for a task - Haiku 5.5, Sonnet 5.5, Opus 5.5 or Fable 5.2 at low, medium, high, xhigh or max - from the kind of work, its volume, how long a person waits, and whether the result can be checked. Covers what to try before a bigger model (self-verification, then effort, then the model), models for subagents and parallel workers, when to switch models in a session, cost per finished task, the API differences to test before a migration, and how to measure candidates on your own tasks. Use when the user asks which model or effort to use, when you choose a model for a subagent, an agent definition, a scheduled task, a CI job or an API call, when a model is too slow, too expensive or not good enough, when you plan a multi-agent setup, or when code moves from one Claude model to another, also when the user does not say "model selection".
---

# Model selection

The price of a token is not the cost of a task.
A bigger model that finishes in fewer steps can cost less than a smaller model at a higher effort level.
A small model on work that is simple and easy to check costs a fraction of a big one.
So pick the model and the effort level from the task.

This skill holds the Claude lineup of 2026-11-09, from [Which Claude model should you build with?](https://claude.dev/blog/which-claude-model-should-you-build-with/) by Addy Osmani.
Model names, prices and defaults change.
When the user names a model that is not in this skill, or a decision depends on an exact price, check [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) and [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) first, and say which facts you checked.

## The lineup

| Model | Claude Code alias | API ID | Built for | Input / output per million tokens |
| --- | --- | --- | --- | --- |
| Haiku 5.5 | `haiku` | `claude-haiku-5-5` | High-volume, cost-sensitive tasks | $0.10 / $0.50 up to 100K tokens of prompt, $0.50 / $2.50 over 100K |
| Sonnet 5.5 | `sonnet` | `claude-sonnet-5-5` | Fast, capable help with well-scoped tasks | $2 / $10 |
| Opus 5.5 | `opus` | `claude-opus-5-5` | The daily driver for complex coding and knowledge work | $4 / $20 |
| Fable 5.2 | `fable` | `claude-fable-5-2` | The most ambitious, open-ended technical work | $8 / $40 |

The effort levels are `low`, `medium`, `high`, `xhigh` and `max`.
Each model has a 1M-token context window and 128K tokens of output.
Haiku 5.5 is the fastest, Sonnet 5.5 is fast, and Opus 5.5 and Fable 5.2 have moderate latency.
Mythos 5.2 is the model for cybersecurity and life sciences research.
It is available through verification programs, so do not recommend it unless the user says they have access.

## Start here

Start on Opus 5.5 at `medium`.
It is the default model in Claude Code and the starting point that the platform docs recommend.
Use it also when you are not sure.
Then move down, or up, only for a reason from the table below.

## Pick by task

| Task | Starting model | Starting effort | Why |
| --- | --- | --- | --- |
| Everyday engineering and debugging, feature work over several pull requests | Opus 5.5 | `medium`, then `high` | The balance of cost and capability for everyday tasks |
| Classification, routing, tagging, extraction at high volume | Haiku 5.5 | `medium` | The lowest cost and latency in the family |
| Subagents that search files, read logs or summarize | Haiku 5.5 or Sonnet 5.5 | The default of the model | A wrong answer is cheap to spot, and the main model has the judgment calls |
| Chat and interactive sessions | Sonnet 5.5, or Haiku 5.5 for simple chat at volume | `low` or `medium` | Sonnet 5.5 is fast, most of all at `low` or `medium` |
| Well-scoped coding: a bug fix, a feature iteration, work against a spec | Sonnet 5.5 | `medium`, then `high` for harder tasks | It does scoped tasks well at half the Opus 5.5 token price |
| Everyday documents, slides and spreadsheets | Sonnet 5.5 | `high` on the API, `medium` in Claude Code | It iterates fast and has a strong eye for design |
| Agent tasks that run again and again: investigation, review, drafting | Sonnet 5.5 | `medium` | A well-defined, repeated task rarely needs a bigger model |
| Computer use and vision-heavy workflows | Opus 5.5 | `medium` | These runs are long agentic loops over many screenshots and images |
| Major refactors and migrations, architecture planning, leading many subagents | Fable 5.2 | `medium`, then `high` | The most capable generally available model for technical fields |
| Deep research, scientific or quantitative analysis | Fable 5.2 | `medium`, then `high` | Built for the hardest technical projects in coding, finance and the sciences |
| You are not sure yet | Opus 5.5 | `medium` | The default in Claude Code, and the starting point in the platform docs |

On the API, Sonnet 5.5 and Fable 5.2 default to `high`, so set the effort in the request when the table says `medium`.

Check these points before you answer, because they move a task to a different row:

- A clear spec does not make a task easy.
  A migration or a performance optimization can have a clear spec and still need Opus 5.5, or Fable 5.2 when it is a major one.
- A complex financial model, or a document built from a large pile of source material, starts on Opus 5.5 and not on Sonnet 5.5.
- A long run that nobody watches goes to Fable 5.2.
- The hardest technical projects in coding, finance and the sciences go to Fable 5.2.
- When a person waits for each reply, latency counts.
  Start on Sonnet 5.5 at `low` or `medium`.
- A small model does well on high-volume work with outputs that can be checked.
  It is less suited to a long agentic loop.
- When every call needs a prompt over 100K tokens, Haiku 5.5 bills at five times its short-prompt rate.
  Compare it with Sonnet 5.5 on cost per finished task.

## When the result is not good enough

Take these steps in order, and stop at the first one that fixes the result.

1. Check that the model can verify its own work, with a test, a build, or a script that calls the endpoint.
   This often costs less and adds less latency than a higher effort level.
2. Raise the effort one level.
3. Move to the next model up, and start it at a lower effort level than you used on the smaller model.

Effort is a finer dial than the model, for both cost and capability.
A higher level helps when the model must think longer, call more tools, or check its work more.
It adds latency, and it does not give the model knowledge or skill that it does not have.
For that, move up a model.

Past `high`, one more effort level can cost as much as a bigger model.
So when Opus 5.5 at `high` still falls short, test Fable 5.2 at a lower effort before you go to `xhigh` or `max`.
On FrontierCode 2.0, Fable 5.2 at `high` scored about level with Opus 5.5 at `max` for about half the cost per task.

## When it is too slow or costs too much

- Lower the effort one level before you change the model.
  On SWE-bench Pro, Opus 5.5 at `medium` scored about 2.5 points lower than at `high` for about 70% of the cost.
- When outcomes can be checked automatically, run everything at `low` and re-run only the failures at `high`.
- Keep the context of the main model lean, because each turn sends it again.
  Give the verbose reading to subagents on a smaller model.
- Move well-scoped work down to Sonnet 5.5, and simple high-volume work down to Haiku 5.5.
- When you need a faster reply and no loss of capability, Opus 5.5 and Fable 5.2 have fast mode on the Claude API, at a premium price.

Price the hardest tasks in the set, not only the typical ones, because the hardest tasks carry most of the spend.
The numbers are in `references/models.md`.

## Models for subagents and workers

- Put a small model on work where a mistake is cheap to spot: find files, run tests, read logs, summarize.
  Start that work on Haiku 5.5.
  Move it to Sonnet 5.5 when its mistakes cost the main model real work, for example when the main model opens the wrong files after a search.
- Keep code edits and judgment calls on the main model.
  A subagent that edits code inherits the model of the session, with `model: inherit`.
  Put it on a smaller model only for well-scoped work with a test that checks the result, never on Haiku 5.5, and measure it first.
- For work bigger than one context window, a top-tier model leads and many cheaper workers run in parallel.
  For one chain of dependent steps, or work that fits in one context window, use one agent, because the planning and merging cost more than they save.
- When the routing rule is simple, such as one model for each type of step, let code pick the model and do not ask a model to pick.

When you start subagents yourself, set the model of each one with this rule, and do not let all of them inherit the model of the session.

Switch the model of a session only at a natural break.
The prompt cache belongs to the model that wrote it, so the first turn on a new model pays the cache-write price on the whole conversation.
A move down a tier also loses the earlier reasoning.

Read `references/mixing-models.md` before you write a subagent definition, switch models in the middle of a task, or plan an advisor or a team of workers.

## Where to set it

| Place | Model | Effort |
| --- | --- | --- |
| Claude Code session | `/model <alias>`, `claude --model <alias>` | `/effort <level>`, `claude --effort <level>` |
| Subagent definition in `.claude/agents/` | `model:` in the frontmatter | `effort:` in the frontmatter |
| Subagent that you start | The `model` parameter of the Agent tool | - |
| Default for subagents with no model | `CLAUDE_CODE_SUBAGENT_MODEL` | - |
| Messages API | `model` | `output_config.effort` |

In Claude Code, you cannot change the model of the session that you run in.
Give the user the command, and say when to run it.
`/effort status` shows the effort level of the current session, because the default in Claude Code can differ from the default on the API.

## How to report the choice

Give the recommendation first, then the reason.
For one task, use this shape:

```markdown
**Model:** Sonnet 5.5 (`sonnet`, `claude-sonnet-5-5`)
**Effort:** `medium`
**Why:** A bug fix with a failing test is well-scoped work, and Sonnet 5.5 does it at half the Opus 5.5 token price.
**If it falls short:** Raise the effort to `high`, then move to Opus 5.5 at `medium`.
**Set it with:** `/model sonnet`, then `/effort medium`
```

For more than one task, use one table with the columns Task, Model, Effort, Why and If it falls short.
State the trait of the task that decided the choice, not a general statement about the model.
When the user is about to commit money or a migration to the choice, add the measurement steps below.

## Measure on your own work

Published benchmark results give a starting model.
The task set of the user decides.

1. Pull a sample of real tasks, and write an outcome check for each one, such as a passing test, a closed ticket or a correct row count.
2. Run each candidate model at two or three effort levels, each in its own session, so that the runs do not share a cache.
   Record the cost of each completed task from the `usage` field of each response.
3. Plot the score against the spend.
   Keep a setup with more than one model only if it beats every single-model point on that chart.
4. Run the winner in shadow on a slice of real traffic before the cutover.

For a quick check in Claude Code, run one task from the backlog on two models with `/model`, and compare what `/usage` reports.

## Gotchas

- The `haiku` alias resolves to Haiku 5.5 only on the Anthropic API, with Claude Code v2.1.293 or later.
  On Amazon Bedrock, Google Cloud, Microsoft Foundry and Claude Platform on AWS it still resolves to Haiku 4.5.
  `ANTHROPIC_DEFAULT_HAIKU_MODEL` pins the model that the alias uses.
- The built-in Explore subagent of Claude Code runs on the model of the session, and no longer always on Haiku.
  To keep exploration cheap, define a subagent with the name `Explore` and `model: haiku`.
- The `opusplan` alias plans with Opus and makes the edits with Sonnet.
  That is the reverse of the rule above, so measure it on your own tasks before you make it the default.
- The advisor tool is in beta, and in the platform cost guide no advisor pairing clearly beat its executor alone.
  Measure how often the executor asks for advice before you add an advisor.
- You cannot always change only the model name.
  Forced tool use, thinking that is turned off, and sampling parameters return an error on some models.
  Read `references/compatibility.md` before you move a request to a different model.
- Do not quote a price or a benchmark number from memory.
  Take it from this skill or from the docs, and name the source.

## Read next

- You compare cost, latency or context between models, or need a number for an argument: read `references/models.md`.
- You write a subagent definition, switch models in a session, or plan an advisor or parallel workers: read `references/mixing-models.md`.
- You move an API request or a pipeline to a different model, or one system runs several models: read `references/compatibility.md`.
