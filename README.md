# skills

Agent Skills by Karol Binkowski.
Each skill uses the [Agent Skills](https://agentskills.io) format and works in each agent that supports it.

## Skills

| Skill | What it does |
| --- | --- |
| [testing-pyramid](skills/testing-pyramid/SKILL.md) | A testing approach for agent-native apps: strict runtime contracts, one `assert` function, and tests that state the specification, with E2E kept small. |

## Install

```bash
npx skills add GrzywN/skills@testing-pyramid
```

## Layout

- `skills/<name>/` is a skill.
  This is what you install.
- `evals/<name>/` has the test prompts and the example project for a skill.
  It is not installed.
- `repos/agentskills/` is a copy of the Agent Skills specification, for reference.

## Validate

```bash
make validate
```

This checks each skill against the specification.
It needs Docker.

## License

[MIT](LICENSE)
