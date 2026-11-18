---
name: wow-wtf-audit
license: MIT
description: Audits a product by using it for real as its target user, and returns a ranked list of changes that remove WTF moments (a broken expectation, such as confusion, a dead end, lost work, an unexplained wait, an error with no way forward) and add WOW moments (an expectation that is beaten). Walks the full journey from first impression to cancelling, through five lenses (first-time user, power user, skeptical evaluator, phone on a slow connection, keyboard and screen reader), visits the empty, loading, error and partial states, measures time to first value, reproduces each WTF a second time, and scores each moment by severity, reach and position. Read-only. Use when the user asks for a product, UX, usability, onboarding or first-run audit, a friction or delight review, a dogfooding pass, asks what annoys or delights users, why users drop off or do not activate, or what to fix first in a web app, mobile app, CLI or API, also when the user does not say WOW or WTF.
---

# WOW/WTF audit

A user keeps a product for its WOW moments and leaves it for its WTF moments.
This audit finds both by using the product for real, and returns a ranked list of changes, each backed by evidence that the reader can check.

## Definitions

- **WTF moment.**
  The expectation of the user is broken in a bad way: confusion, a dead end, lost work, an unexplained wait, an error with no way forward, an inconsistency, a surprise cost or permission request, copy that they must read twice.
- **WOW moment.**
  The expectation is beaten: value arrives sooner than expected, the product anticipates the next step, a mistake is forgiven, a detail shows care, the result is something the user would show to another person.
- **Neutral moment.**
  Everything else.
  A neutral moment counts only when it sits on the critical path and a small change can turn it into a WOW.
  Record it then as a **missed WOW**.

The critical path is the shortest chain of steps from the first screen to the core job done.

An expectation is not your taste.
It comes from one of three sources, and each record names its source:

- **The promise of the product:** a headline, a label, the step before.
- **A convention:** what the same control does in the other products that the target user knows.
- **The job:** what the user came to do.

## Inputs

| Input | When it is missing |
| --- | --- |
| The product and the access to it: a URL, a build, a repository, a test account | Ask. You cannot audit without it. |
| The target user | Take it from the landing page or the README, and state it as an assumption at the top of the report. |
| The core job of that user (the job to be done) | The same. |
| The competitors | Use the alternatives that the product names itself. If it names none, pick the two that a buyer would compare first, and say that you picked them. |

Ask for all missing inputs in one message.
Do not ask for an input that the request, the product or the repository already answers.

## The audit is read-only

- Do not change code, configuration, feature flags, or a setting that other people share.
  Do not commit.
  If the product needs a fix before it starts, that is a WTF of its setup: record it and do not fix it.
- Use only the access that the user gave you.
  Create an account only when the user allows it or the instance is a local or a test one, and then with an `@example.com` address.
- Work in the test account, and create your own records there.
  Do not edit or delete a record that you did not create.
  Change a setting of the test account only when a flow needs it, and put it back after.
- Never pay, also not with a test card that the user did not give you.
  Walk a purchase, an upgrade, a cancellation and an account deletion up to the last step before the one that cannot be undone, and stop there.
- Do not send a message, an invitation or an email to a real person.
- Look at competitors only through their public pages.
- You can start the product from its repository, in the way its README or `Makefile` says.
  Stop each process that you started when the audit ends.

When a step needs more than this, do not take it.
List the step under "could not reach" in the Coverage section.

Write the report and the evidence to the directory that the user names.
With no directory named, create `wow-wtf-audit/` in the working directory, with `report.md`, `walk-log.md` and `evidence/`.

## Workflow

Progress:

- [ ] 1. Frame the audit
- [ ] 2. Walk the journey as a first-time user
- [ ] 3. Walk it again through the other four lenses
- [ ] 4. Do the wrong thing, and visit each state
- [ ] 5. Reproduce each WTF a second time
- [ ] 6. Find the root causes
- [ ] 7. Score and rank
- [ ] 8. Write the report and check it

When the user asks for a part of the audit, such as one stage, one lens or one flow, walk only that part.
Keep the record, the score and the six sections of the report, and say in the Coverage section what you left out.

### 1. Frame the audit

Collect the inputs.
Write the target user, the core job, the access and the competitors at the top of `walk-log.md`.
Define **first value**: the first moment when the product does the core job on the own input of the user.
A demo, a tour or a sample project is not first value.

Read `references/driving.md` now.
It says how to drive a web app, a mobile app, a CLI or an API, how to take evidence, and how to measure.

### 2. Walk the journey as a first-time user

Do this walk first, before you read the code, the docs or the issue tracker.
You can be a first-time user only once, and each fact that you learn from the inside hides a WTF from you.

Walk the stages in order:

1. First impression
2. Signup and onboarding
3. First value
4. The core loop
5. Settings and billing
6. Errors and edge cases
7. Coming back after a break
8. Leaving or cancelling

Before each action, write in `walk-log.md` one line with what the target user expects to happen next.
After the action, write what happened, and mark the step as WTF, WOW, missed WOW or neutral.
The difference between the two lines is the finding.
Take a screenshot at each step where the two lines differ.

Measure the time to first value on this walk: the clicks, the fields, and the seconds.

### 3. Walk it again through the other four lenses

Each lens shows moments that the others hide.

- A daily power user
- A skeptical evaluator who compares the product with the competitors
- A person on a phone with a slow connection
- A person who uses only a keyboard and a screen reader

Walk the same stages through each lens, and record only what is new.
Read `references/walkthrough.md` for what to look for in each stage and how to set up each lens.

If you can start subagents, and each one can have its own account or its own instance of the product, run these four lenses in parallel.
With one shared account, run them one after another, because the records of one walk change what the next one sees.
Give each subagent the definitions, the read-only rules, the record and `references/walkthrough.md`.

### 4. Do the wrong thing, and visit each state

Most WTF moments are in the states that a demo does not show.
On each key screen, visit four states: empty, loading, error and partial.
On each key flow, do the wrong thing on purpose: empty input, huge input, the back button, a refresh in the middle, a double click, an expired session, no connection.

A key screen is a screen on the critical path, or a screen that each user sees.
The probes and the ways to force each state are in `references/walkthrough.md`.

### 5. Reproduce each WTF a second time

Start from a clean session, and follow your own written steps.

- It happens again: it is verified.
- It happens only sometimes: try three more times, and report the rate, for example "2 of 4".
- It does not happen again: move it to the unverified list, with what you saw the first time.

Do not drop a moment that you cannot reproduce, and do not promote it to the ranked list.
A thing that you concluded from the code and did not observe in the product is also unverified.

### 6. Find the root causes

Now read the code, if you have it.
Code is for the cause of a moment that you observed, not for a list of moments.
For each record, name the cause and say how sure you are: "confirmed in `path:line`" or "probable".
With no code, give the probable cause from the behaviour, for example from the network requests.

### 7. Score and rank

Use the score and the ranking rules below.

### 8. Write the report and check it

Copy `assets/report-template.md` and fill it in.
Write the report in the language of the request, and keep the labels WTF and WOW.
Put the verdict and the top 5 actions in your reply too, with the path of the report.

Then check the report against this list, and fix what fails:

- Each WTF in the ranked list was observed in the product and was reproduced a second time.
- Each record has evidence: a screenshot file that exists, or steps that a person can follow with no other help.
- Each score shows its three factors.
- Each proposed change names the screen and what changes on it.
  "Improve the onboarding" is not a change.
- The top 5 follows the ranking rules.
- The Coverage section lists each stage and each lens, also the ones that you did not reach.
- Nothing changed: the working tree is as it was, and each process that you started is stopped.

## The record

Write one record for each moment.

```markdown
### WTF-03: The signup form clears each field after a password error

- **Where:** Signup and onboarding, `/signup`
- **Expected:** The form keeps my input and says what is wrong with the password (convention).
- **Happened:** The page shows "Error 422" and all five fields are empty.
- **Evidence:** `evidence/WTF-03-signup-cleared.png`.
  Steps: open `/signup`, fill each field, use the password `short`, press "Create account".
- **Reproduced:** 2 of 2, from a clean session
- **Type:** WTF
- **Score:** 12.0 = severity 4 x reach 1.0 x position 3
- **Root cause:** The handler resets the form on each response that is not 2xx (confirmed in `public/signup.js:31`).
  The server does not send the rule that failed.
- **Proposed change:** Keep the values, show the password rule under the field before the first submit, and show the failed rule next to the field after it.
```

The IDs are `WTF-01`, `WOW-01` and `MISS-01`, numbered in the order of the report.
The title states the broken or beaten expectation, not the name of a screen.

## The score

Score = severity x reach x position.

**Severity**, 1 to 5.
For a WOW or a missed WOW, use the same scale for how far the moment beats the expectation.

| Severity | WTF | WOW |
| --- | --- | --- |
| 1 | The user notices and goes on | A small detail that shows care |
| 2 | The user must stop, read again or try again | A step that is faster or clearer than usual |
| 3 | The user needs a workaround, or goes on in doubt | The product does a step for the user |
| 4 | The user cannot finish the step in this session | The job is done much sooner than the user expected |
| 5 | Lost work, lost money, lost data, a privacy surprise, or the core job cannot be done | The user would show it to another person |

**Reach**, the share of the target users who meet the moment.

| Reach | Who meets it |
| --- | --- |
| 1.0 | Each user: it is on the only path |
| 0.6 | Most users |
| 0.3 | A clear minority: one lens, one device, one optional feature |
| 0.1 | Few users: it needs unusual input or timing |

Use analytics when the user gives you numbers.
If not, say in the Coverage section that the reach is your estimate.

**Position**, by the stage where the moment happens.

| Position | Stage |
| --- | --- |
| 3 | Before first value: first impression, signup and onboarding, first value |
| 2 | The core loop |
| 1 | After it: settings and billing, coming back, leaving |

An error or an edge case takes the position of the stage where it happens.
An early moment has more weight because a user who leaves does not see what comes later.

## Ranking rules

- **WTF before WOW.**
  A broken expectation costs more trust than a delight earns.
  When you put WTF fixes and WOW actions in one list, a WTF score counts double.
- **A WOW that is followed by a WTF is remembered as a WTF.**
  A WOW action does not go above the fix of a WTF that follows it in the same flow.
- **Rank by the impact on the user, not by the cost of the change.**
  The cost is not a part of the score.
  Use it only to order two actions with the same score.
- **The core job before decoration.**
  A WOW opportunity must make the core job faster, safer or better.
  Animation and confetti do not count, unless the moment under them already works.
- **Surface the WOW that exists.**
  Flag each existing WOW that is hidden, late in the journey, or fragile.
  To move it earlier is usually the cheapest gain, so it is a candidate for the top 5.

## The report

The report has six sections, in this order.
The template is `assets/report-template.md`.

1. **Verdict**, in three sentences: the balance of WOW and WTF, and the one biggest lever.
2. **Top 5 actions**, in order.
3. **WTF list**, ranked, with the full record for each.
4. **Existing WOW moments to protect.**
5. **WOW opportunities**, ranked.
6. **Coverage**: what you walked, what you could not reach, what stayed unverified.

## Gotchas

- You read the DOM, and the user sees pixels.
  Decide the next step from a screenshot, as a person does, or you find controls that no person can see and miss the ones that look broken.
  The keyboard and screen reader lens is the reverse: use only the keyboard and the accessibility tree there.
- You are patient, and a user is not.
  Measure each wait.
  A wait over 1 second with no feedback is a WTF, and after 10 seconds a user turns to other work.
- You read each word, and a user scans.
  Internal terms, two names for one thing, and an error code in place of a sentence are copy that a user must read twice.
- Your clock runs slow.
  The time that you take to think is not the time of the product.
  Measure the time to first value on a scripted replay of the path, and report the waits, the clicks and the fields.
- A local build is not production.
  Seed data, mocked email and sandbox payments hide moments and add other ones.
  Say in the Coverage section which instance you walked.
- A bug that only code shows is not a moment.
  If a user cannot meet it, it does not go in this report.
- A missing feature is a WTF only when the product promised it, or when the job cannot be done without it.
  If not, it is at most a WOW opportunity.
- Do not report a matter of taste.
  If you cannot name the source of the expectation, drop the record.
- Do not fix what you find.
  The fix is a different task, and the user decides on it after the report.

## Read next

- You start to use the product, take evidence, or measure time: read `references/driving.md`.
- You walk a stage or a lens, force a state, or do the wrong thing: read `references/walkthrough.md`.
- You write the report: copy `assets/report-template.md`.
