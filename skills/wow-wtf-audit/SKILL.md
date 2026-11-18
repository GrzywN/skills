---
name: wow-wtf-audit
license: MIT
description: Audits a product by using it for real, and returns a ranked list of changes that remove WTF moments (a broken expectation - confusion, a dead end, lost work, an unexplained wait, an error with no way forward, a surprise cost) and add WOW moments (an expectation that is beaten). Walks the journey from first impression to cancelling through five lenses (first-time user, power user, skeptical evaluator, phone on a slow connection, keyboard and screen reader), does the wrong thing on purpose, visits empty, loading, error and partial states, measures time to first value, scores each moment by severity, reach and position, and reports evidence that can be checked. Read-only. Use when the user asks for a product, UX, usability, onboarding, first-run or friction audit, a product teardown, what is confusing or annoying in an app, why users drop off, or a walk through a site, an app, a CLI or an API as a user, also when the user does not say WOW or WTF. Not for code review, security audits or WCAG conformance audits.
---

# WOW/WTF product audit

A user comes to each step of a product with an expectation.
A WTF moment breaks that expectation, and a WOW moment beats it.
This audit finds both by use of the product, and gives a ranked list of changes with evidence that the reader can check.

## Definitions

- **WTF moment**: a point where the expectation of the user is broken in a bad way.
  Confusion, a dead end, lost work, an unexplained wait, an error with no way forward, an inconsistency, a surprise cost or permission request, copy that the user must read twice.
- **WOW moment**: a point where the expectation is beaten.
  Value arrives sooner than expected, the product anticipates the next step, a mistake is forgiven, a detail shows care, the result is something the user would show to another person.
- **Neutral moment**: all other moments.
  A neutral moment goes in the report only when it is on the critical path and a small change can turn it into a WOW.
  Record it as a **missed WOW**.

## Rules

**Read-only.**
Do not change code, data or settings.
Do not spend money, and do not create accounts beyond the test access that the user gave.
Inside that test access, act as a user: the invoices, messages or files that a user makes there are part of the walk.
Do not fix a defect during the audit, also when the fix is one line.
A fix changes the product that the remaining lenses must see.
When the user also asks for fixes, give the report first, then make the fixes as a separate step.

**Observe first, read code second.**
Use the product as a user does.
Do not infer behaviour from code or docs.
Code is for the root cause, after you observed the moment.
A moment that you saw only in code goes to the unverified list.

**Evidence for each moment.**
A screenshot, or reproduction steps that are exact enough for a person to follow without you.
Save screenshots and notes outside the repository, or where the user says.

## Workflow

### 1. Get the inputs

The audit needs five inputs.

| Input | Where it comes from |
| --- | --- |
| Product | The request |
| Target user | The request, then the user |
| Core job to be done | The request, then the user |
| Access: a URL, a build, a repository, a test account | The request, then the user |
| Competitors | The request, or none |

The target user and the core job decide what is a WTF, so do not invent them.
When the request does not give them, read what the product says about itself, propose one user and one job, and ask the user to confirm.
Ask for all missing inputs in one message, and wait for the answer, because a wrong user or a wrong job makes the whole ranking wrong.
When no person can answer, continue with your proposal and put it at the top of the report as an assumption.

With no competitors, the skeptical evaluator compares the product with its own promises.

Find a way to use the product for real:

- A site or a web app: a browser that you control, for example Playwright or a browser tool.
- A repository with no deployed build: start the app with the instructions of the project.
  Look at the `Makefile` first.
- A CLI or a library: install it and run it in a shell.
- An API: call it with an HTTP client.
- A mobile app: an emulator or a device.

When you cannot run the product, say so before you continue.
A review of code alone is not this audit: each finding from it goes to the unverified list.

### 2. Plan the walk

Write down the stages of the journey for this product, in order:

1. First impression.
2. Signup and onboarding.
3. First value.
4. The core loop.
5. Settings and billing.
6. Errors and edge cases.
7. Coming back after a break.
8. Leaving or cancelling.

State what first value is: the first moment when the user has the result of the core job.
An account is not value.

`references/walk.md` has the stages for a CLI, a library and an API.

### 3. Walk as a first-time user

Do this lens before you read the code or the docs.
You can be a first-time user only once, because after you read the code you know where each control is.

Start with a fresh account and a fresh browser profile.
Use only what the product shows.
Record each point where you had to guess.
Measure the time to first value in seconds and in clicks.

Write each moment down when you see it, in the record format of step 6.
After forty screens you do not remember the first ones.

### 4. Repeat the walk through the other lenses

Each lens shows different moments, so walk the journey again for each one.
Record only what the lens changes.

- A daily power user.
- A skeptical evaluator who compares the product with the competitors.
- A person on a phone with a slow connection.
- A person who uses only a keyboard and a screen reader.

When you can start subagents and each one can have its own account, give each lens to one subagent.
A subagent that did not see the code is also a real first-time user.
With one shared account, walk the lenses one after the other, because parallel walks change the data of each other.

Read `references/walk.md` for the setup of each lens and what it looks for.

### 5. Do the wrong thing, and visit each state

Most WTF moments are not on the happy path.

On each key screen, do these on purpose: empty input, huge input, the back button, a refresh in the middle of a flow, a double click, an expired session, no network.

On each key screen, visit these four states: empty, loading, error, partial.

`references/walk.md` says how to cause each one and what a good product does.

### 6. Record each moment

```markdown
### <short name of the moment>

- **Where:** <stage of the journey, screen, URL or file>
- **What happened:** <what the product did>
- **Expected:** <what a reasonable user expected, and where that expectation comes from>
- **Evidence:** <path of the screenshot, or numbered reproduction steps>
- **Type:** WTF | WOW | missed WOW
- **Score:** <severity> x <reach> x <position> = <score>
- **Root cause:** <as far as you can tell, with file and symbol when you have the code>
- **Proposed change:** <concrete enough to implement>
```

The expectation needs a source: the copy of the product, an earlier screen, a platform convention, or the core job.
A moment with no source is your taste, and does not go in the report.

A proposed change names the screen, the new behaviour, and the new copy word for word.
"Improve the error handling" is not a change.
"On a failed save, keep the form, show 'We could not save the invoice. Check your connection and try again.' above the button, and add a Retry button" is one.

### 7. Reproduce, then find the root cause

Reproduce each WTF a second time before you report it, in a clean session.
Your own wrong-thing actions change the state, and a moment that comes from that state is not a moment of the product.

List what you could not reproduce or observe as unverified.
Do not drop it, and do not promote it to a finding.

Then read the code, when you have it, to find the root cause.
With no code, give the root cause as a hypothesis and say that it is not confirmed.

### 8. Score and rank

Score = severity (1 to 5) x reach (the share of users who hit the moment, 0 to 1) x position (3 before first value, 2 in the core loop, 1 after it).
A user who leaves at the signup never sees the settings, so an early moment weighs more.

Rank with these rules:

- WTF before WOW.
  A broken expectation costs more trust than a delight earns, and a WOW followed by a WTF is remembered as a WTF.
- Rank by impact on the user, not by the cost of the implementation.
  Do not move a change up because it is quick to make.
- A WOW comes from a core job that is done better.
  Animation and confetti do not count, unless the moment below them works already.
- Flag each existing WOW that is hidden, late in the journey, or fragile.
  To bring it forward is usually the cheapest gain.

Read `references/scoring.md` for the scales, the tie rules and worked examples.

### 9. Report

Use the template in `assets/report-template.md`, with these six sections in this order:

1. **Verdict** in three sentences: the balance of WOW and WTF, and the single biggest lever.
2. **Top 5 actions**, in order.
3. **WTF list**, ranked, with the full record of each one.
4. **Existing WOW moments to protect.**
5. **WOW opportunities**, ranked.
6. **Coverage**: what you walked, what you could not reach, and what is unverified.

Give the report in your response.
Write it to a file only when the user asks, at the path that the user gives.

## Gotchas

- Automation hides WTF moments.
  A script clicks a selector that a person cannot find, and waits four seconds with no complaint.
  Before each click, look at the screenshot and ask if a person finds this control from the screen alone.
  Time each wait.
- Seconds from an automated walk are a lower limit, because a person also reads.
  Say so next to the number, and give the clicks, the fields and the screens too.
- A code smell is not a WTF.
  A moment needs an effect that a user can see.
- You cannot hear a screen reader.
  Read the accessibility tree and say in the report that it is a proxy.
- A flow that pays, cancels or deletes cannot be undone.
  Walk it to the last step before the action, record what you see, and stop.
  Do the last step only when the user said that the test account is disposable.
- A moment that blocks a whole group, such as a control that the keyboard cannot reach, has a low reach and a high severity.
  Mark it "blocks a group" in the record, so that a low score does not hide it.
- Do not compare with a competitor from memory.
  Compare with what you can observe now, or list the comparison as unverified.
- Do not pad the lists.
  Five WTF moments with evidence are worth more than twenty guesses, and a product with one WOW has one WOW.

## Read next

- You plan or do the walk: read `references/walk.md`.
- You score, rank or pick the top 5: read `references/scoring.md`.
- You write the report: copy `assets/report-template.md`.
