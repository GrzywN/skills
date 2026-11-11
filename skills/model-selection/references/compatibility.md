# Compatibility between models

The facts are from [Which Claude model should you build with?](https://claude.dev/blog/which-claude-model-should-you-build-with/), published on 2026-11-09.

A different model name is not always the only change.
Each current model supports tool use and image input.
Test the differences below before you move a request from one model to another.

## Checks before a migration

### Thinking

- Opus 5.5 and Fable 5.2 always think, and a request that turns thinking off returns an error.
- Sonnet 5.5 thinks by default, and `between_tools` limits thinking to the gaps between tool calls.
- Haiku 5.5 thinks by default, and you can turn thinking off at `high` effort or below.
- On each model, read content blocks by `type`, because a response can begin with a thinking block.
  Code that reads `content[0].text` breaks.

### Forced tool use

A `tool_choice` of `any` or `tool` returns a 400 error on Sonnet 5.5, Opus 5.5 and Fable 5.2.
Send `auto`, mark the tool `strict: true`, and say in the prompt when to use the tool.

### Preserved thinking on Fable 5.2

Fable 5.2 has preserved thinking on each API account.
The API rejects a request with a 400 error when anything before a Fable 5.2 thinking block has changed.
That includes the system prompt, the tools and an earlier message.
The request can opt in to dropping the affected thinking.

- Requests built through Claude Code, the Claude Agent SDK or Claude Managed Agents need no change.
- Code of your own that edits the history must keep it append-only.
  Test this before the switch.

### Computer use

Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2 support computer use only through the `computer_toolset_20260801` toolset, on the Claude API and on Claude Models on Google Cloud (Google managed).

### Haiku 4.5 to Haiku 5.5

- Replace `budget_tokens` with an effort level.
- Remove non-default `temperature`, `top_p` and `top_k` values, because they return a 400 error.
- End `messages` with a user turn.
  A final assistant turn for the model to continue also returns a 400 error.
  Put the output format in the prompt, or use a strict tool.

The article gives these three rules for the move to Haiku 5.5.
For a move from Haiku 4.5 to a different model, read the [migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide) of that model, and apply the rule for the strictest model below.

### Safety fallbacks

Opus 5.5, Sonnet 5.5 and Fable 5.2 run safety classifiers that most often flag cybersecurity and biology content.
In Claude Code, a flagged request can run again on an older model, and a notice in the transcript says which one.
For Fable 5.2, a flagged cybersecurity request falls back to Opus 4.8, and a flagged biology request falls back to Opus 5.
So the model that a user asked for is not always the model that answered.

## One system with several models

Build each request for the strictest model in the system.
Then a step can move up or down a tier with no code change.

- Keep the history append-only.
- Send `tool_choice: auto` with strict tools.
- Send no `budget_tokens`, no non-default `temperature`, `top_p` or `top_k`, and no final assistant turn.
- Read content blocks by `type`.
- Write prompts and tool descriptions that are precise enough for the most literal model.
- When the routing rule is simple, such as one model for each type of step, let code pick the model and do not ask a model to pick.

After the code change, measure the candidates on real tasks before you switch.
The steps are in "Measure on your own work" in `SKILL.md`.
