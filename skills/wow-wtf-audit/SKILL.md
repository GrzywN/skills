---
name: wow-wtf-audit
license: MIT
description: Audits a product by using it for real as its target user, and returns a ranked list of changes that remove WTF moments (a broken expectation, such as confusion, a dead end, lost work, an unexplained wait, an error with no way forward) and add WOW moments (an expectation that is beaten). Walks the full journey from first impression to cancelling through five user lenses, reproduces each WTF, and scores each moment by severity, reach and position, with evidence for each one. Read-only. Use when the user asks for a product, UX, usability, onboarding or first-run audit, a friction or delight review, a dogfooding pass, a review of the developer experience (DX) of a CLI, an API or an SDK, asks what annoys or delights users, why users drop off or do not activate, or what to fix first in a product, also when the user does not say WOW or WTF. Not for a code review, a security or dependency audit, a WCAG conformance audit, or a load test.
---

# WOW/WTF audit

A user keeps a product for its WOW moments and leaves it for its WTF moments.
This audit finds both by using the product for real, and returns a ranked list of changes, each backed by evidence that the reader can check.

## Definitions

- **WTF moment.**
  The expectation of the user is broken in a bad way.
  Examples: confusion, a dead end, lost work, an unexplained wait, an error with no way forward, an inconsistency, a surprise cost or permission request, copy that the user must read twice.
- **WOW moment.**
  The expectation is beaten.
  Examples: value arrives sooner than expected, the product anticipates the next step, a mistake is forgiven, a detail shows care, the result is something the user would show to another person.
- **Neutral moment.**
  Everything else.
- **Missed WOW.**
  A neutral moment on the critical path that a small change can turn into a WOW.
  It is the only neutral moment that you record.
  The WOW opportunities of the report are these records.

A record has one of three types: WTF, WOW or missed WOW.
An **action** is a change that you propose: the fix of a WTF, or a WOW action that surfaces an existing WOW or turns a missed WOW into a WOW.

The **critical path** is the shortest chain of steps from the first screen to the core job done.
A **key screen** is a screen on the critical path, or a screen that each user sees.
**First value** is the first moment when the product does the core job on the user's own input.
A demo, a tour or a sample project is not first value.

An expectation is not your taste.
It comes from one of three sources, and each record names its source:

- **The promise of the product:** a headline, a label, the step before.
- **A convention:** what the same control does in the other products that the target user knows.
- **The job:** what the user came to do.

If you cannot name the source, drop the record.

## Inputs

| Input | When it is missing |
| --- | --- |
| The product and the access to it: a URL, a build, a repository | Ask. You cannot audit without it. |
| An account, when the product has a signup: a test account, or the permission to sign up with an address that you can read mail for | Ask, unless you start the instance yourself from the repository. |
| The target user | Take it from the request or the README. If only the landing page has it, take it after the first-screen test of step 2. State it as an assumption at the top of the report. |
| The core job of that user (the job to be done) | The same. |
| The competitors | Use the alternatives that the product names itself. If it names none, pick the two that a buyer would compare first, and say that you picked them. |

Ask only for the first two, in one message, and only when the request, the product and the repository do not answer them.
Infer the other three, and state them as assumptions.

## The audit is read-only

The product, its code, its settings and the data of other people are the same after the audit as before it.

- **Code.**
  Do not change code, configuration or feature flags, and do not commit.
  If the product needs a fix before it starts, that is a WTF of its setup: record it and do not fix it.
  Do not fix what you find later either: the user decides on the fixes after the report.
- **Settings.**
  Open each settings and billing screen and read it.
  Do not save a change.
- **Data.**
  To use the product for real creates records.
  The only data that you add is your own records in the test account.
  Do not edit or delete a record that you did not create.
- **Accounts.**
  Use only the access that the user gave you.
  Create an account only when the user allows it.
- **Money.**
  Do not pay.
  The one exception is a test card that the user gave you, in a sandbox.
- **Steps that cannot be undone.**
  Walk a purchase, an upgrade, a cancellation and an account deletion up to the last step before the one that cannot be undone, and stop there.
- **Other people.**
  Do not send a message, an invitation or an email to a real person.
  Look at competitors only through their public pages.

An instance that you started yourself from the repository, with its own data, is the one exception.
There you can sign up with an `@example.com` address, save a setting of your own account, and delete your own records.
Start it in the way its README or `Makefile` says, and stop each process that you started when the audit ends.

When a step needs more than this, do not take it.
List the step under "could not reach" in the Coverage section.

Write the report and the evidence to the directory that the user names.
With no directory named, create `wow-wtf-audit/` in the working directory, with `report.md`, `walk-log.md` and `evidence/`.
Put your own scripts there too, install nothing into the product, and do not commit the directory.

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
Write the target user, the core job, the access, the competitors and what first value is for this product at the top of `walk-log.md`.
Prepare the input that the target user brings, for example a real-looking invoice with a long company name, and use it on each walk.
Input such as "test" hides the moments that real names, addresses and amounts cause.

Read `references/driving.md` now.
It says how to drive a web app, a mobile app, a CLI or an API, how to take evidence, and how to measure time.

### 2. Walk the journey as a first-time user

Do this walk first, before you read the code, the docs or the issue tracker.
The README is the exception, and only for the way to start the product and for the target user.
You can be a first-time user only once, and each fact that you learn from the inside hides a WTF from you.

Read `references/walkthrough.md` before the walk.
It has the first-screen test, what to look for in each stage, and the setup of each lens.

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

Stage 6 is step 4 of this workflow.
On the walks, record each error that you meet on the way, and do not force one.

Count the clicks and the fields to first value on this walk.
Time the seconds later, on a scripted replay of the same path.

### 3. Walk it again through the other four lenses

Each lens shows moments that the others hide.

- A daily power user
- A skeptical evaluator who compares the product with the competitors
- A person on a phone with a slow connection
- A person who uses only a keyboard and a screen reader

Walk the same stages through each lens, and record only what is new.

If you can start subagents, and each one has its own account or its own instance of the product, run these four lenses in parallel.
Do not create accounts on a shared instance to make this possible.
With one shared account, run the lenses one after another, because the records of one walk change what the next one sees.
Give each subagent this skill, the frame from `walk-log.md`, the moments found so far, its lens, and its account or instance.
You do the scoring and the ranking yourself, after all of them report.

### 4. Do the wrong thing, and visit each state

Most WTF moments are in the states that a demo does not show.
On each key screen, visit four states: empty, loading, error and partial.
On each key flow, do the wrong thing on purpose: empty input, huge input, the back button, a refresh in the middle, a double click, an expired session, no connection.

Do this once, with the desktop setup of the first-time user.
Then repeat only the "no connection" probe on the phone, and only the error state with the keyboard.
The probes and the ways to force each state are in `references/walkthrough.md`.

### 5. Reproduce each WTF a second time

Start from a clean session, and follow your own written steps.

- It happens again: it is verified.
- It does not happen on the second try: try three more times.
  One more hit makes it verified as intermittent, with the rate, for example "2 of 5".
  No hit moves it to the unverified list, with what you saw the first time.
- A moment that an account meets only once, such as a tour or a first-run screen, needs a new account or a fresh instance.
  With none, it is unverified, and the record says that a second account verifies it.

Do not drop a moment that you cannot reproduce, and do not promote it to the ranked list.
A thing that you concluded from the code, and that a user can meet, but that you did not observe in the product, is also unverified.
A thing in the code that no user can meet does not go in the report.

### 6. Find the root causes

Now read the code, if you have it.
Code is for the cause of a moment that you observed, not for a list of moments.
For each record, name the cause and say how sure you are: "confirmed in `path:line`" or "probable".
With no code, give the probable cause from the behaviour, for example from the network requests.

Now read also what real users said, if you have it: the issue tracker, the reviews, the support tickets, the analytics.
Use it to set the reach.
List a known complaint that the walks did not meet under "unverified".

### 7. Score and rank

Use the score and the ranking rules below.

### 8. Write the report and check it

Copy `assets/report-template.md` and fill it in.
Write the report in the language of the request, and keep the labels WTF and WOW.
Put the verdict and the top 5 actions in your reply too, with the path of the report.

Then check the report against this list, and fix what fails:

- Each WTF in the ranked list was observed in the product and was reproduced a second time.
- Each record has evidence: a screenshot file that exists, or steps that a person can follow with no other help.
- Each record names the source of its expectation.
- Each score shows its three factors.
- Each proposed change names the screen and what changes on it.
  "Improve the onboarding" is not a change.
- The top 5 follows the ranking rules.
- The Coverage section has each stage and each lens, including the ones that you did not reach, and each record and account that you created.
- No tracked file changed, the only new files are the output directory and what the documented setup creates, and each process that you started is stopped.

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
- **Score:** 5.4 = severity 3 x reach 0.6 x position 3
- **Root cause:** The handler resets the form on each response that is not 2xx (confirmed in `public/signup.js:31`).
  The server does not send the rule that failed.
- **Proposed change:** Keep the values, show the password rule under the field before the first submit, and show the failed rule next to the field after it.
```

A WOW record has one more field, **Flags:** hidden, late, fragile, or none, each with its reason.

Give each moment an ID when you find it: `WTF-01`, `WOW-01` and `MISS-01`, in the order of discovery.
Do not change an ID later, because the evidence files have it in their names.
The rank is the position in the report, not the ID.
A subagent puts its lens in the ID, for example `WTF-phone-03`.
The title states the broken or beaten expectation, not the name of a screen.

## The score

Score = severity x reach x position.

**Severity**, 1 to 5.

| Severity | WTF | WOW |
| --- | --- | --- |
| 1 | The user notices and goes on | A small detail that shows care |
| 2 | The user must stop, read again or try again | A step that is faster or clearer than usual |
| 3 | The user needs a workaround, or goes on in doubt | The product does a step for the user |
| 4 | The user cannot finish the step in this session | The job is done much sooner than the user expected |
| 5 | Lost work, lost money, lost data, a privacy surprise, or the core job cannot be done | The user would show it to another person |

- When two rows fit, take the higher one.
- Lost work is severity 5 when it took the user more than one minute to make.
  Less than that is severity 3.
- A wait with no feedback is severity 1 up to 3 seconds, 2 up to 10 seconds, and 3 over 10 seconds.
- For a missed WOW, use the row that the moment reaches after the proposed change.

**Reach**, the share of the users at that stage who meet the moment.

| Reach | Who meets it |
| --- | --- |
| 1.0 | Each user: it is on the only path |
| 0.6 | Most users |
| 0.3 | A clear minority |
| 0.1 | Few users: it needs unusual input or timing |

- Do not lower the reach because the stage is late.
  The position does that.
- A lens is not a reach.
  A moment on a phone is 0.3 only when a minority of the target users has a phone in hand.
- With analytics from the user, use the real share.
  With none, say in the Coverage section that the reach is your estimate.

**Position**, by the stage where the moment happens.

| Position | Stage |
| --- | --- |
| 3 | Before first value: first impression, signup and onboarding, first value |
| 2 | The core loop |
| 1 | After it: settings and billing, coming back, leaving |

- An error or an edge case takes the position of the stage where it happens.
- A moment that happens in more than one stage takes the earliest one.
- An early moment has more weight because a user who leaves does not see what comes later.

## Ranking rules

- **Rank by the impact on the user, not by the cost of the change.**
  The cost is not a part of the score, and not a tie-break.
  With the same score, the higher severity goes first, then the earlier stage.
- **WTF before WOW.**
  A broken expectation costs more trust than a delight earns.
  In the top 5, the fix of a WTF goes before a WOW action.
  The one exception: a WTF of severity 1 or 2 goes below a WOW action that has a higher score.
- **A WOW that is followed by a WTF is remembered as a WTF.**
  A WOW action does not go above the fix of a WTF that the user meets after it on the critical path.
- **One action for one root cause.**
  When more than one record has the same root cause, write one action that lists each ID.
  Its score is the highest score among them.
- **The core job before decoration.**
  Rank a WOW action that makes the core job faster, safer or better above one that does not.
  Animation and confetti do not count, unless the moment under them already works.
- **Surface the WOW that exists.**
  Flag each existing WOW that is hidden, late in the journey, or fragile.
  To surface it is to make it visible or to bring it earlier.
  That is usually the cheapest gain, so it is a candidate for the top 5.
  Score that action as the WOW at its new position and reach.

## The report

The report has six sections, in this order.
The template is `assets/report-template.md`.

1. **Verdict**, in three sentences: the balance of WOW and WTF, and the one biggest lever.
2. **Top 5 actions**, in order.
3. **WTF list**, ranked, with the full record for each.
4. **Existing WOW moments to protect.**
5. **WOW opportunities**, ranked: the missed WOW records.
6. **Coverage**: what you walked, what you could not reach, what stayed unverified.

## Gotchas

- You read the DOM, and the user sees pixels.
  Decide the next step from a screenshot, as a person does, or you find controls that no person can see and miss the ones that look broken.
  The keyboard and screen reader lens is the reverse: use only the keyboard and the accessibility tree there.
- You are patient, and a user is not.
  You do not feel a wait of 3 seconds between two tool calls, so time each wait in a script.
  A wait over 1 second with no feedback is a WTF.
- You read each word, and a user scans.
  Internal terms, two names for one thing, and an error code in place of a sentence are copy that a user must read twice.
- A local build is not production.
  Seed data, mocked email and sandbox payments hide moments and add other ones.
  Say in the Coverage section which instance you walked.
- A missing feature is a WTF only when the product promised it, or when the job cannot be done without it.
  If not, it is at most a missed WOW.

## Read next

- You start to use the product, take evidence, or measure time: read `references/driving.md`.
- You walk a stage or a lens, force a state, or do the wrong thing: read `references/walkthrough.md`.
- You write the report: copy `assets/report-template.md`.
