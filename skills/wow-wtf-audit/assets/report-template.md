# WOW/WTF audit: [product]

| | |
| --- | --- |
| Product | [name, version or commit, the instance that you walked] |
| Target user | [who, and "assumed" if you inferred it] |
| Core job | [the job to be done, and "assumed" if you inferred it] |
| Access | [URL, build, repository, test account] |
| Compared with | [competitors, and who named them: the user, the product, or the auditor] |
| Date | [YYYY-MM-DD] |
| Time to first value | [N clicks, N fields, N characters, N seconds of waiting, at least N seconds for a person (estimate), on the path: step, step, step] |
| Moments | [N WTF, N WOW, N missed WOW, N unverified] |

## 1. Verdict

[Sentence 1: the balance of WOW and WTF, with the counts and where in the journey each group sits.]
[Sentence 2: what that balance does to the target user and the core job.]
[Sentence 3: the one biggest lever.]

## 2. Top 5 actions

| # | Action | Fixes or adds | Score | Why it is here |
| --- | --- | --- | --- | --- |
| 1 | [a change, concrete enough to implement] | [WTF-03, WTF-07] | [5.4] | [one line] |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

The score is the score of the record.
The fix of more than one WTF has the highest score among its WTF records.
An action that surfaces a WOW has the score of the WOW at its new position and reach.
Each fix of a WTF is above each WOW action.

## 3. WTF list

Ranked by score, the highest first.
The IDs are in the order of discovery, so they are not in order here.

### WTF-03: [the broken expectation, in one line]

- **Where:** [stage, screen, URL or file]
- **Expected:** [what a reasonable target user expected, and the source: promise, convention or job]
- **Happened:** [what the product did]
- **Evidence:** [`evidence/WTF-03-name.png`, and the exact steps]
- **Reproduced:** [2 of 2, from a clean session]
- **Type:** WTF
- **Score:** [5.4 = severity 3 x reach 0.6 x position 3]
- **Root cause:** [the cause, and "confirmed in `path:line`" or "probable"]
- **Proposed change:** [the screen, and what changes on it]

## 4. Existing WOW moments to protect

Each record has the same fields as a WTF record, with these changes:

- **Type:** WOW
- **Flags:** [hidden, late, fragile, or none, each with its reason]
- **Root cause:** [what makes the moment work]
- No **Reproduced** field
- **Proposed change:** [how to make it visible, bring it earlier or protect it, or "none"]

### WOW-01: [the beaten expectation, in one line]

## 5. WOW opportunities

The missed WOW records, ranked by score, the highest first.
Each record has the same fields as a WTF record, with these changes:

- **Type:** missed WOW
- **Score:** [with the severity that the moment reaches after the proposed change]
- **Root cause:** [what is missing]
- No **Reproduced** field
- **Proposed change:** [the change, and if it makes the core job faster, safer or better]

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

Each cell is one of: walked, partly (with the reason), not reached, not applicable, out of scope.
In the "Errors and edge cases" row, write what step 4 of the workflow covered in the column of the setup that it ran in, and "not applicable" in the other columns.

States visited on the key screens: [screen: empty, loading, error, partial].
Wrong things done: [flow: empty input, huge input, back, refresh, double click, expired session, offline].

Created by the audit: [each account and each record that you created, and each file outside the output directory].

### Could not reach

- [what, and why: no access, needs payment, needs a real person, cannot be undone, needs time to pass]

### Unverified

- [what you saw once, concluded from the code, or know from a complaint, the steps that you tried, and what you need to verify it]

### Limits of this audit

- [the instance: local, staging or production, and what it hides]
- [the reach values: from analytics, or estimated by the auditor]
- [the tools: the device and the network profile of the phone lens, an accessibility tree in place of a real screen reader]
