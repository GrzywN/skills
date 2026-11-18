---
name: wow-wtf-audit
license: MIT
description: Audits a product by using it for real, and returns a ranked list of changes that remove WTF moments (a broken expectation, such as confusion, a dead end, lost work, an unexplained wait, an error with no way forward or a surprise cost) and add WOW moments (an expectation that is beaten). Walks the journey from first impression to cancelling as five kinds of user, does the wrong thing on purpose, measures time to first value, and gives evidence for each moment. Read-only. Use when the user asks for a product, UX, usability, onboarding, signup, first-run, friction or developer-experience audit, review or teardown, for feedback on a product or first impressions of it, to try or test it as a real user, what is confusing or annoying in it, or why users drop off, for a site, an app, a CLI or an API, also when the user does not say WOW or WTF. Not for code review, a fix for one known bug, writing tests, or a security, performance, Lighthouse, SEO or WCAG conformance audit.
---

# WOW/WTF product audit

A user comes to each step of a product with an expectation.
This audit finds the moments that break it and the moments that beat it, by using the product.
The result is a ranked list of changes, with evidence that the reader can check.

## Definitions

- **WTF moment**: a point where the expectation of the user is broken in a bad way.
  Confusion, a dead end, lost work, an unexplained wait, an error with no way forward, an inconsistency, a surprise cost or permission request, copy that the user must read twice.
- **WOW moment**: a point where the expectation is beaten.
  Value arrives sooner than expected, the product anticipates the next step, a mistake is forgiven, a detail shows care, the result is something the user would show to another person.
- **Neutral moment**: all other moments.
  A neutral moment goes in the report only when it is on the critical path and a small change can turn it into a WOW.
  Record it as a **missed WOW**.
- **First value**: the first moment when the user has the result of the core job.
  An account is not value.
- **Critical path**: the steps from the first screen to first value.
- **Key screen**: a screen on the critical path, or a screen of the core loop where the user enters or changes data.
  Most products have three to eight.

## Rules

**Read-only.**
Do not change the code, the configuration or the data of the product.
Do not spend money, and do not create accounts beyond the test access that the user gave.
Inside that test access, act as a user: the records that a user makes there and the account settings that a user changes there are part of the walk.
Sign up for a new account only on a build that you started yourself, or when the user said that you can.
Do not fix a defect during the audit, also when the fix is one line.
A fix changes the product that the remaining lenses must see.
When the user also asks for fixes, give the report first, then make the fixes as a separate step.

**Observe first, read code second.**
Use the product as a user does.
Do not infer behaviour from code or docs.
Code is for the root cause, after you observed the moment.
A moment that you saw only in code goes to the unverified list.

**Evidence for each moment.**
Give numbered reproduction steps that a person can follow without you, because the reader cannot always open your screenshot.
Add the path of the screenshot when you have one.
Save screenshots and notes in one folder outside the repository, or where the user says, and name that folder at the top of the report.

## The record

Each moment has one record.

```markdown
### <short name of the moment>

- **Where:** <lens, stage of the journey, screen, URL or file>
- **What happened:** <what the product did>
- **Expected:** <what a reasonable user expected, and where that expectation comes from>
- **Evidence:** <numbered reproduction steps, and the path of the screenshot>
- **Reproduced:** <twice, the second time in a clean session | once, and why>
- **Type:** WTF | WOW | missed WOW
- **Score:** <severity> x <reach> x <position> = <score>
- **Flags:** <blocks a group | hidden | late | fragile | none>
- **Root cause:** <as far as you can tell, with file and symbol when you have the code>
- **Proposed change:** <concrete enough to implement>
```

Write Where, What happened, Expected and Evidence when you see the moment.
After forty screens you do not remember the first ones.
The other fields come in steps 6 and 7.

The expectation needs a source: the copy of the product, an earlier screen, a platform convention, or the core job.
A moment with no source is your opinion, and does not go in the report.

A proposed change names the screen, the new behaviour, and the new copy word for word.
"Improve the error handling" is not a change.
"On a failed save, keep the form, show 'We could not save the invoice. Check your connection and try again.' above the button, and add a Retry button" is one.

## Workflow

### 1. Get the inputs

| Input | Where it comes from |
| --- | --- |
| Product | The request |
| Target user | The request, then the user |
| Core job to be done | The request, then the user |
| Access: a URL, a build, a repository, a test account | The request, then the user |
| Competitors | The request, then the user. "None" is a valid answer |
| Scope: the stages and the lenses | The request, or all of them |

The target user and the core job decide what is a WTF, so do not invent them.
When the request does not give them, read what the product says about itself: its landing page, its README, its store page.

- The copy names one kind of user and one job: continue with them, put them at the top of the report as an assumption, and ask the user to confirm them at the end.
  A different answer changes the ranking, and the observations stay valid.
- The copy names more than one kind of user, or none: ask before you walk, and wait for the answer, because the journey itself is not known.
  When no person can answer, continue with the user and the job that the copy supports best, as an assumption.

Ask all open questions in one message.

With no competitors, the skeptical evaluator compares the product with its own promises.

When the user names a part of the journey, walk the earlier stages only to get there, and record moments only inside the scope.
Report a WTF outside the scope in one line when it blocks the path.

When the user gives the notes of a walk that a person did, do not walk again unless the user asks.
Treat what that person saw as observed, name the person as the evidence, and start at step 7.
What the person could not reproduce, or only heard from another person, is unverified.
Say in the coverage section that you did not walk the product.

Find a way to use the product for real:

- A site or a web app: a browser that you control.
  Use a browser tool of the session first, then Playwright when it is installed.
- A repository with no deployed build: start the app with the instructions of the project.
  Look at the `Makefile` first.
- A CLI or a library: install it and run it in a shell.
- An API: call it with an HTTP client.
- A mobile app: an emulator or a device.

Do not install a tool in the repository of the user.
With only an HTTP client for a web app, you can observe copy, links, status codes and response bodies.
A moment that needs a rendered screen or a click is then unverified.

When you cannot run the product, say so before you continue.
A review of code alone is not this audit.
Its report has the unverified list in the order to check it, with the file and the symbol of each item, the coverage section, and what you walk first when a build exists.
It has no confirmed WTF, no confirmed WOW and no measured time.

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

State what first value is for this product, and list the key screens.

A lens is done when each stage in the scope is walked, or is in the coverage section as not reached with the reason.
When a WTF blocks the path, record it, go around it with the test account or a workaround, and continue.

When you can start subagents and each one can have its own account, give each lens to one subagent.
Give it the five inputs, the rules, the record format, its lens from `references/walk.md` and the evidence folder.
It returns records with no score.
When two lenses return the same moment, keep one record and name both lenses.
A subagent that did not see the code is also a real first-time user.
With one shared account, walk the lenses one after the other, because parallel walks change the data of each other.

Read `references/walk.md` now, before the first walk.

### 3. Walk as a first-time user

Do this lens before you read the code or the docs.
You can be a first-time user only once, because after you read the code you know where each control is.

Start with a fresh browser profile, and with a fresh account when the rules allow one.
With no fresh account, walk the signup to the last step before the submit, continue in the test account, and write "partly" in the coverage.

Use only what the screen shows.
Find each control in the screenshot, and click it by its visible text or its role.
Do not read the HTML or the repository to find a selector: a control that you can find only in the source is a WTF.
Record each point where you had to guess.

Measure the time to first value: the clicks, the fields that the user types, the screens, and the seconds of waiting that the product causes.
For the seconds of the whole path, run the same path in one script after the walk.
Your own thinking time is in the first walk, and a person also reads, so call the number of the script a lower limit.

### 4. Repeat the walk through the other lenses

Each lens shows different moments, so walk the journey again for each one.
Record only what the lens changes.

- A daily power user.
- A skeptical evaluator who compares the product with the competitors.
- A person on a phone with a slow connection.
- A person who uses only a keyboard and a screen reader.

### 5. Do the wrong thing, and visit each state

Most WTF moments are not on the path where each step goes right.

On each key screen, do these on purpose: empty input, huge input, the back button, a refresh in the middle of a flow, a double click, an expired session, no network.

On each key screen, visit these four states: empty, loading, error, partial.

Do this once, after the first-time walk.
On the phone, repeat only what changes with the layout or the connection.
Skip an action that a screen has no control for.

`references/walk.md` says how to cause each one and what a good product does.

### 6. Reproduce, then find the root cause

Reproduce each WTF a second time before you report it, in a clean session.
A clean session is a new browser context, and a new account for a moment before first value when you can make one.
Your own wrong-thing actions change the data, and a moment that comes from that data is not a moment of the product.

List what you could not reproduce or observe as unverified.
Do not drop it, and do not list it as a WTF.

Then read the code, when you have it, to find the root cause.
With no code, give the root cause as a hypothesis and say that it is not confirmed.

### 7. Score and rank

Score = severity (1 to 5) x reach (the share of the users at that stage who hit the moment, 0 to 1) x position (3 up to first value, 2 in the core loop, 1 in the other stages).
An error or an edge case has the position of the stage where the user hits it.
A user who leaves at the signup never sees the settings, so an early moment weighs more.

Rank with these rules:

- WTF before WOW.
  A broken expectation costs more trust than a delight earns, and a WOW followed by a WTF is remembered as a WTF.
- Rank by impact on the user, not by the cost of the implementation.
  Do not move a change up because it is quick to make.
- Prefer a WOW that comes from the core job done better over decoration.
  Animation and confetti do not count, unless the moment below them works already.
- Flag each existing WOW that is hidden, late in the journey, or fragile, and propose the change that brings it forward.
  It works already, so this is usually the cheapest gain.

Read `references/scoring.md` for the scales, the rules for the top 5 and worked examples.

### 8. Report

Use the template in `assets/report-template.md`, with these six sections in this order:

1. **Verdict** in three sentences: the balance of WOW and WTF, and the single biggest lever.
2. **Top 5 actions**, in order.
3. **WTF list**, ranked, with the full record of each one.
4. **Existing WOW moments to protect.**
5. **WOW opportunities**, ranked.
6. **Coverage**: what you walked, what you could not reach, and what is unverified.

Write the report in the language of the request.
Give the report in your response.
Write it to a file only when the user asks, at the path that the user gives.

## Gotchas

- Automation hides WTF moments.
  A script clicks a selector that a person cannot find, and waits four seconds with no complaint.
  Look at the screenshot and ask if a person finds this control from the screen alone, and time each wait.
- Bad code that the user cannot see is not a WTF.
  A moment needs an effect that a user can see.
- You cannot hear a screen reader.
  Read the accessibility tree and say in the report that it is a proxy.
- A payment, a plan cancellation, an account deletion and a message to a real person cannot be undone.
  Walk each to the last step before the action, record what you see, and stop.
  Do the last step of a cancellation or an account deletion only when the user said that the test account is disposable.
  Do not complete a payment, unless the user gave a test payment method for it.
  Send a message only to a test address.
- A delete of a record that you made during the walk is part of the walk.
  Do it, and record what the product does after it.
- A moment that blocks a whole group, such as a control that the keyboard cannot reach, has a low reach and a high severity.
  Flag it "blocks a group", so that a low score does not hide it.
- Open only the public pages of a competitor: the landing page, the pricing and the docs.
  Do not compare from memory: what you cannot observe now is unverified.
- Do not make the lists longer than the evidence.
  Five WTF moments with evidence are worth more than twenty guesses, and a product with one WOW has one WOW.

## Read next

- You plan or do the walk: read `references/walk.md`.
- You score, rank or pick the top 5: read `references/scoring.md`.
- You write the report: copy `assets/report-template.md`.
