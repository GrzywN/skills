# Beyond automated tests

These layers are the narrow top of the pyramid.
Use them when the layers below cannot hold a requirement.

## Architecture tests

Some rules apply to the whole codebase and are quick to check.
Examples are no emoji in the code, no comments in the code, or a fixed file structure.
Write such a rule as an architecture test or a small CLI check and run it in CI.

A new project often does not need them.
They pay off in a codebase that already exists and must be kept in line.
Pest shows the idea well.

## Manual tests

Some user stories cannot be fully tested in E2E, or are worth testing on the production app.
Typical cases are payments, a complete process from start to end, behavior that is not deterministic, and integrations with external services inside iframes.

Write them as a checklist that a person ticks off in a browser.

- One HTML file for each plan.
- The ticks are saved in `localStorage`, so a reload does not lose them.
- The plan is split into short stages, so several people can share the work.
- Each item is a concrete user story with the expected result.
- The file lives in the directory that the project uses for manual tests.
  That directory is not `docs/`.

## Real users

Real users are testers too.
The app must help them report and must help you reproduce.

- Give users a way to send feedback when an error happens.
  An email link or a simple form is enough.
- Record each error in the error reporting service, with enough context to fix it.
- Make the system auditable where you can.
  For example, keep an imported CSV file in the database, so a developer can replay the defect.
- Show the software version in the UI, as a release name or a short git commit hash.
  Then each report tells you which version had the defect.

## Documentation

Documentation is the last form of a test.
It is hard to verify and it goes out of date without a sound.

- Do not add documentation to the code, except as a last option.
- Documentation must not repeat what the code, the tests, and the assertions already say.
- The layers of this pyramid are the documentation.
  The code documents itself, and the specification lives in the tests and next to the code it applies to.
- Prefer documentation that is generated, such as an OpenAPI specification or Storybook for components.
  It is best when the specification from all layers can be read in one place that is built from the code.
- If something is so complex that it needs documentation, or it is a workaround, fix the code.
  The need for an explanation is a sign that a better design exists.

### Decision records

If the project already has ADRs, use them and keep the name ADR.
If it has none, do not write one.
The code shows what is implemented now, and git history records how it got there.
