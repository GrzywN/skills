# The models and their trade-offs

The facts are from [Which Claude model should you build with?](https://claude.dev/blog/which-claude-model-should-you-build-with/), published on 2026-11-09.
The prices are Claude API list prices.
Check [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) when a decision depends on an exact price.

## Side by side

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 | Fable 5.2 |
| --- | --- | --- | --- | --- |
| Built for | High-volume, cost-sensitive tasks | Fast, capable help with well-scoped tasks | Complex coding and knowledge work, each day | The most ambitious, open-ended technical work |
| Relative latency | Fastest | Fast | Moderate | Moderate |
| Input / output, per million tokens | $0.10 / $0.50 up to 100K tokens of prompt, $0.50 / $2.50 over 100K | $2 / $10 | $4 / $20 | $8 / $40 |
| Cache reads, per million tokens | $0.01 up to 100K, $0.05 over 100K | $0.10 | $0.20 | $0.20 |
| Context window | 1M tokens | 1M tokens | 1M tokens | 1M tokens |
| Max output | 128K tokens | 128K tokens | 128K tokens | 128K tokens |
| Thinking on the API | Adaptive, on by default, can be turned off | Adaptive, on by default, `between_tools` skips upfront thinking | Adaptive, always on | Adaptive, always on |
| Default effort on the API | `medium` | `high` | `medium` | `high` |
| Default effort in Claude Code | `medium` | `medium` | `medium` | `medium` |
| Fast mode | No | No | Yes | Yes |

`/effort status` shows the effort level of a Claude Code session.

## Capability against cost per finished task

A bigger model costs more per token and is more capable.
That does not hold for each task: a higher price per token does not always mean a higher cost per task, or a better result.

- On Terminal-Bench 3.0, the previous Fable, 5.1, at `max` scored 58.0%.
  Opus 5.5 at `high` scored 58.9% with half the tokens.
- On FrontierCode 2.0, Fable 5.2 at `high` scored 45.3% and Opus 5.5 at `max` scored 45.5%.
  Fable 5.2 did it for about half the cost per task.
  So before you raise Opus 5.5 past `high` on a hard task, test Fable 5.2.
- For everyday work, Opus 5.5 at `medium` is still the place to start.
- A small model does well on high-volume work with outputs that can be checked.
  It is less suited to a long agentic loop.

When you compare two models, price the hardest tasks in the set and also the typical ones.
The hardest tasks carry most of the spend.
On one search benchmark with 20 problems, two problems carried 43% of the spend.

## Latency against accuracy

A faster setup finishes sooner and can miss more.
Decide how long a person can wait before you pick the model and the effort level.
For a reply that a person waits for, start on Sonnet 5.5 at `low` or `medium`.

Effort and latency rise together.
On SWE-bench Pro, with Opus 5.5 at `high` as the base:

| Effort | Score against `high` | Cost against `high` |
| --- | --- | --- |
| `low` | About 8 points lower | About a third |
| `medium` | About 2.5 points lower | About 70% |
| `xhigh` | About 1.4 points higher | 2.5 times |

A means of self-verification often costs less and adds less latency than a higher effort level.

When outcomes can be checked automatically, run everything at a low level and re-run only the failures at a high level.
On the same SWE-bench Pro subset, Opus 5.5 at `low` with the failures re-run at `high` passed about 97% of the tasks for about $0.17 each.
Every task at `high` passed 95.3% for $0.29 each.

Newer models are often faster than the models they replace.
Fable 5.2 generates output up to 30% faster than Fable 5.1, and Sonnet 5.5 runs 30% faster than Sonnet 5.

When you need a faster reply from the same model, pay for speed and keep the capability.
On the Claude API, Opus 5.5 and Fable 5.2 have fast mode, with a higher output speed at a premium price.

## Context against cost

Each model has a 1M-token context window.
A large context can help the model finish the task, and it costs on each turn, because each turn sends it again.
On a long run, most of the input bills as cache reads.

- A cache read costs $0.20 per million tokens on Opus 5.5 and on Fable 5.2, and $0.10 on Sonnet 5.5.
  So on a long, cache-heavy run, the gap between Fable 5.2 and Opus 5.5 comes down to uncached input and to output, where Fable 5.2 costs twice as much per token.
- On Opus 5.5, the cache read of one turn costs about $0.03 at 150K tokens of context, and about $0.004 at 20K.
- The bigger the main model, the more a lean main context matters.
  Keep the context of the expensive model for the decisions, and let cheaper subagents do the verbose reading.

Haiku 5.5 is the only model where the token price depends on the prompt length.

- A prompt of up to 100K tokens bills at the lower tier.
  There, Haiku 5.5 costs a twentieth of the input price of Sonnet 5.5.
- A prompt over 100K tokens bills at five times that rate, which is still a quarter of the per-token price of Sonnet 5.5.
- So Haiku 5.5 pays off most on short prompts.
  When every call needs a long prompt, compare Haiku 5.5 with Sonnet 5.5 on cost per finished task, not on list price.
