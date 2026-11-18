# WOW/WTF audit: [product]

| | |
| --- | --- |
| Product | [name, version or commit, the instance that you walked] |
| Target user | [who, and "assumed" if you inferred it] |
| Core job | [the job to be done, and "assumed" if you inferred it] |
| Access | [URL, build, repository, test account] |
| Compared with | [competitors, and "picked by the auditor" if the user named none] |
| Date | [YYYY-MM-DD] |
| Time to first value | [N clicks, N fields, N seconds of waiting, on the path: step, step, step] |
| Moments | [N WTF, N WOW, N missed WOW, N unverified] |

## 1. Verdict

[Sentence 1: the balance of WOW and WTF, with the counts and where in the journey each group sits.]
[Sentence 2: what that balance does to the target user and the core job.]
[Sentence 3: the one biggest lever.]

## 2. Top 5 actions

| # | Action | Fixes or adds | Score | Why it is here |
| --- | --- | --- | --- | --- |
| 1 | [a change, concrete enough to implement] | [WTF-01] | [12.0] | [one line] |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

A WTF score counts double against a WOW score in this table.

## 3. WTF list

Ranked by score, the highest first.

### WTF-01: [the broken expectation, in one line]

- **Where:** [stage, screen, URL or file]
- **Expected:** [what a reasonable target user expected, and the source: promise, convention or job]
- **Happened:** [what the product did]
- **Evidence:** [`evidence/WTF-01-name.png`, and the exact steps]
- **Reproduced:** [2 of 2, from a clean session]
- **Type:** WTF
- **Score:** [12.0 = severity 4 x reach 1.0 x position 3]
- **Root cause:** [the cause, and "confirmed in `path:line`" or "probable"]
- **Proposed change:** [the screen, and what changes on it]

## 4. Existing WOW moments to protect

Each record has the same fields as a WTF record, with these changes:

- **Type:** WOW
- **Flags:** [hidden, late, fragile, or none, each with its reason]
- **Proposed change:** [how to protect it, or how to bring it earlier]

### WOW-01: [the beaten expectation, in one line]

## 5. WOW opportunities

Ranked by score, the highest first.
Each record has the same fields as a WTF record, with **Type:** missed WOW, or WOW opportunity when no neutral moment exists yet.
Each one says how it makes the core job faster, safer or better.

### MISS-01: [the moment that can beat the expectation, in one line]

## 6. Coverage

### Walked

| Stage | First-time user | Power user | Skeptical evaluator | Phone, slow connection | Keyboard and screen reader |
| --- | --- | --- | --- | --- | --- |
| First impression | | | | | |
| Signup and onboarding | | | | | |
| First value | | | | | |
| The core loop | | | | | |
| Settings and billing | | | | | |
| Errors and edge cases | | | | | |
| Coming back after a break | | | | | |
| Leaving or cancelling | | | | | |

Each cell is one of: walked, partly (with the reason), not reached.

States visited on the key screens: [screen: empty, loading, error, partial].
Wrong things done: [flow: empty input, huge input, back, refresh, double click, expired session, offline].

### Could not reach

- [what, and why: no access, needs payment, needs a real person, cannot be undone, needs time to pass]

### Unverified

- [what you saw once or concluded from the code, the steps that you tried, and what you need to verify it]

### Limits of this audit

- [the instance: local, staging or production, and what it hides]
- [the reach values: from analytics, or estimated by the auditor]
- [the tools: for example an accessibility tree in place of a real screen reader]
