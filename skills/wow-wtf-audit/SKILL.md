---
name: wow-wtf-audit
license: MIT
description: Audits a product by using it for real as its target user, and returns a ranked list of changes that remove WTF moments (a broken expectation, such as confusion, a dead end, lost work, an unexplained wait, an error with no way forward) and add WOW moments (an expectation that is beaten). Walks the full journey from first impression to cancelling through five user lenses, reproduces each WTF, and scores each moment by severity, reach and position, with evidence. Read-only. Use when the user asks for an audit or a review of a product, its UX, usability, onboarding or first run, a friction or delight review, a dogfooding pass, a review of the developer experience (DX) of a CLI, an API or an SDK, asks what annoys or delights the users of a product, why users drop off or do not activate, or what to fix first in the experience of a product, also when the user does not say WOW or WTF. Not for a code review, a security or dependency audit, a WCAG conformance audit, a load test, or an analysis of feedback data alone.
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
An **action** is a change that you propose: the fix of a WTF, or a WOW action.
A WOW action surfaces or protects an existing WOW, or turns a missed WOW into a WOW.

- The **critical path** is the shortest chain of steps from the first screen to the core job done.
- A **key screen** is a screen on the critical path, or a screen that each user sees.
- A **key flow** is a chain of steps on the critical path that ends in a saved result.
- **First value** is the first moment when the product does the core job on the user's own input.
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
| An account, when the product has a signup: the permission to sign up, with a mailbox from the user if the product checks the address, or a test account | Ask, unless the instance is your own, as the read-only rules define it. Prefer the permission to sign up, because a ready account skips the signup and the onboarding. |
| A test card and a test recipient, when the core job pays or sends a message | Ask. With none, stop before the payment or the send. |
| The target user | Take it from the request or the README. If only the landing page has it, take it after the first-screen test of step 2. State it as an assumption at the top of the report. |
| The core job of that user (the job to be done) | The same. |
| The competitors, only when you walk the skeptical evaluator lens | Use the alternatives that the product names itself. If it names none, pick the two that a buyer would compare first, and say that you picked them. |

Ask only for the first three, in one message, and only when the request, the product and the repository do not answer them.
When you ask, say that the audit uses the product for real and changes nothing.
Infer the other three, and state them as assumptions.
You can say that analytics and user complaints make the reach more exact, but do not wait for them.
While you wait for the access, do not list likely findings, because nothing is observed yet.

With only a ready account, read the signup form and stop before the submit, mark that stage as "partly", and count the time to first value from the login.

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
  Real use creates records.
  The only data that you add is your own records in the test account.
  You can edit and delete only the records that you created.
- **Accounts.**
  Use only the access that the user gave you.
  Create an account only when the user allows it.
- **Money.**
  Do not pay, except with a test card that the user gave you, in a sandbox.
- **Steps that cannot be undone.**
  Walk a purchase, an upgrade, a cancellation and an account deletion up to the last step before the one that cannot be undone, and stop there.
  A payment with that test card is not such a step.
  When you cannot tell if a step can be undone, treat it as one that cannot.
- **Other people.**
  Do not send a message, an invitation or an email to a real person.
  When the core job sends one, send it only to the test recipient that the user gave you.
  Look at competitors only through their public pages.

**Your own instance.**
An instance that you start from the repository is your own when it has its own database and no live keys for email or payment.
Check its configuration before you rely on that.
If you cannot tell, the instance is not your own.
In your own instance you can sign up with an `@example.com` address, save a setting of your account, and start the instance again to get fresh data.

- Start it in the way its README or `Makefile` says.
- You can take a setup step that the README lacks when it changes no tracked file, such as an install of dependencies or a copy of an example config.
  Record that step as a WTF.
- Note the ID of each process that you start, and stop only those when the audit ends.

When a step needs more than these rules allow, do not take it.
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

When the user asks for a part of the audit, such as one stage, one lens, one flow or one complaint to check, walk only that part.

- For a complaint, the part is each flow and each screen that can cause it.
- In an audit of one lens, do the walk of step 2 and the work of step 4 in the setup of that lens, and skip step 3.
- Keep the record, the score and the six sections of the report, and mark what you left out as "out of scope" in the Coverage section.

### 1. Frame the audit

Write the access, and what the request and the README say about the target user and the core job, at the top of `walk-log.md`.
Add the rest after the first-screen test of step 2: what first value is for this product, and the competitors.

Prepare the input that the target user brings, for example a customer record with a long company name, a local phone number and a local number format.
Use it on each walk, because input such as "test" hides the moments that real data causes.

Read `references/driving.md` now.
It says how to drive a web app, a mobile app, a CLI or an API, how to take evidence, and how to measure time.

### 2. Walk the journey as a first-time user

Do this walk first, before you read the code, the docs or the issue tracker.
You can be a first-time user only once, and each fact that you learn from the inside hides a WTF from you.
The README and the `Makefile` are the exception: read them for the way to start the product, the test account, the target user and the core job.
For a CLI, an API or an SDK, the README and the public docs are the first screen, so read them as a user does.

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

Stage 6 is the work of step 4.
On the walks, record each error that you meet on the way, and do not force one.

Count the clicks, the fields and the typed characters to first value on this walk.
Time the seconds later, on a scripted replay of the same path.

### 3. Walk it again through the other four lenses

Each lens shows moments that the others hide.

- A daily power user
- A skeptical evaluator who compares the product with the competitors
- A person on a phone with a slow connection
- A person who uses only a keyboard and a screen reader

Walk the same stages, except stage 6, through each lens, and record only what is new.

If you can start subagents, `references/walkthrough.md` says when to run the lenses in parallel.

### 4. Do the wrong thing, and visit each state

Most WTF moments are in the states that a demo does not show.
On each key screen, visit four states: empty, loading, error and partial.
On each key flow, do the wrong thing on purpose: empty input, huge input, the back button, a refresh in the middle, a double click, an expired session, no connection.

Do this once, with the desktop setup of the first-time user.
Then repeat only "no connection" on the phone, and only the error state with the keyboard.
The ways to force each state and to do each wrong thing are in `references/walkthrough.md`.

### 5. Reproduce each WTF a second time

Start from a clean session, and follow your own written steps.

- It happens again: it is verified.
- It does not happen on the second try: try three more times.
  One more hit makes it verified, with the rate in the record, for example "2 of 5".
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
Write the report in the language of the request: translate the headings and the field names, and keep the labels WTF and WOW.
Put the verdict and the top 5 actions in your reply too, with the path of the report.
When the request names a problem, answer that first in your reply, and say where its records are in the ranking.
Do not change the rank for it.

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
### WTF-03: The import says "Done", and most of the contacts are not in the list

- **Where:** First value, `/contacts/import`
- **Expected:** After "Done", each contact of my file is in the list (promise: "Bring your contacts in one step").
- **Happened:** The page says "Done". The list has 28 of my 240 contacts, and no message says why.
- **Evidence:** `evidence/WTF-03-import-28-of-240.png`.
  Steps: open `/contacts/import`, upload `contacts-240.csv` from the output directory, press "Import", open "Contacts".
- **Reproduced:** 2 of 2, from a clean session
- **Type:** WTF
- **Score:** 5.4 = severity 3 x reach 0.6 x position 3
- **Root cause:** The import skips each row with a phone number that has no country code, and does not count the skipped rows (confirmed in `src/import/parse.ts:48`).
- **Proposed change:** On `/contacts/import`, show "28 imported, 212 skipped: the phone number has no country code" with a link to the skipped rows.
```

A WOW record has one more field, **Flags:** hidden, late, fragile, or none, each with its reason.
A WOW or a missed WOW record has no **Reproduced** field, and its **Root cause** says what makes the moment work, or what is missing.

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
- "The core job cannot be done" means that the product leaves no path to it.
- Lost work is severity 5 when it took the user more than one minute to make, by the time estimate of `references/driving.md`.
  Less than that is severity 3.
- For a wait with no feedback, this rule sets the severity, and not the table: 1 up to 3 seconds, 2 up to 10 seconds, 3 over 10 seconds.
  Time the wait with no throttle, except in the phone lens.
- For a missed WOW, use the row that the moment reaches after the proposed change.

**Reach**, the share of the target users at that stage who meet the moment.

| Reach | Who meets it |
| --- | --- |
| 1.0 | Each user: it is on the only path |
| 0.6 | Most users |
| 0.3 | A clear minority |
| 0.1 | Few users: it needs unusual input or timing |

- Do not lower the reach because the stage is late.
  The position does that.
- The lens that found a moment does not set its reach.
  Estimate the share of the target users who use the product in that way, for example on a phone.
  With no numbers, a moment that only a keyboard user meets is 0.1.
- A state that you forced, such as an expired session or no connection, has the reach of the users who meet that state in real use.
  With no numbers, that is 0.1.
- With analytics from the user, use the real share.
  With none, say in the Coverage section that the reach is your estimate.

**Position**, by the place in the journey where the user meets the moment, not by the topic of the screen.

| Position | Stage |
| --- | --- |
| 3 | Before first value: first impression, signup and onboarding, first value |
| 2 | The core loop |
| 1 | After it: settings and billing, coming back, leaving |

- A login, a limit or a paywall that the user meets before first value is 3, and in the core loop it is 2.
- An error or an edge case takes the position of the stage where it happens.
- A moment that happens in more than one stage takes the earliest one.
- An early moment has more weight because a user who leaves does not see what comes later.

## Ranking rules

Make the list of actions with these rules, in this order.

1. **One action for one change.**
   When one change fixes more than one record, write one action that lists each ID.
   An action that fixes a WTF is the fix of a WTF, and its score and its severity are the highest among its WTF records.
   An action with no WTF record is a WOW action, with the highest score among its records.
   When one action makes another one unnecessary, say so in the second one, and keep both in the list.
2. **Rank by the impact on the user, not by the cost of the change.**
   Order the fixes of the WTF records by score.
   The cost is not a part of the score, and not a tie-break.
3. **WTF before WOW.**
   A broken expectation costs more trust than a delight earns, and a WOW that is followed by a WTF is remembered as a WTF.
   So each WOW action goes after the last fix of a WTF.
4. **The core job before decoration.**
   Among the WOW actions, one that makes the core job faster, safer or better goes before one that does not.
   After that, the score decides.
   Animation and confetti do not count as a WOW, unless the moment under them already works.
5. **Ties.**
   With the same score, the higher severity goes first, then the earlier stage, then the lower ID.

The top 5 is the first five actions of that list.

**Surface the WOW that exists.**
Flag each existing WOW that is hidden, late in the journey, or fragile.
A WOW is fragile when a small change of the input breaks it, or when a WTF follows it in the journey.
Write a WOW action for each flag: make the WOW visible, bring it earlier, or protect it.
Score that action as the WOW at its new position and reach.
This is often the smallest change with the largest effect, so each flag gets its action in the report, also when the action is not in the top 5.

## The report

The report has the six sections of `assets/report-template.md`, in this order:

1. **Verdict**, in three sentences: the balance of WOW and WTF, and the one biggest lever.
2. **Top 5 actions**, in order.
3. **WTF list**, ranked by score, with the full record for each.
4. **Existing WOW moments to protect.**
5. **WOW opportunities**, ranked by score: the missed WOW records.
6. **Coverage**: what you walked, what you could not reach, what stayed unverified.

## Gotchas

- You read the DOM, and the user sees pixels.
  On the first walk, decide each next step from a screenshot, as a person does, or you find controls that no person can see and miss the ones that look broken.
  On the later walks you can run a script and look at its screenshots after.
  The keyboard and screen reader lens is the reverse: use only the keyboard and the accessibility tree there.
- You are patient, and a user is not.
  You do not feel a wait of 3 seconds between two tool calls, so time each wait in a script.
  A wait over 1 second with no feedback is a WTF.
- You are fast, and a user is not.
  A script that types before the page is ready makes a moment that no person meets.
  Wait as a person does, or record the moment as a state that you forced.
- You read each word, and a user scans.
  Internal terms, two names for one thing, and an error code in place of a sentence are copy that a user must read twice.
- A local build is not production.
  Seed data, mocked email and sandbox payments hide moments and add other ones.
  Say in the Coverage section which instance you walked.
- A missing feature is a WTF only when the product promised it, or when the job cannot be done without it.
  If not, it is at most a missed WOW.
