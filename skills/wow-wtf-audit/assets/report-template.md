# WOW/WTF audit: <product>

- **Target user:** <who>
- **Core job:** <job to be done>
- **Access used:** <URL, build, repository, test account>
- **Competitors:** <names, or "none given: compared with the promises of the product">
- **Assumptions:** <each input that the user did not confirm, or "none">
- **Time to first value:** <seconds, as a lower limit> s, <clicks> clicks, <fields> fields, <screens> screens, of which <seconds> s is waiting

## 1. Verdict

<Sentence 1: the balance of WOW and WTF, with the counts.>
<Sentence 2: what that balance does to the target user on the way to the core job.>
<Sentence 3: the single biggest lever.>

## 2. Top 5 actions

| # | Action | Closes | Type | Score |
| --- | --- | --- | --- | --- |
| 1 | <one change, concrete> | <names of the moments> | WTF | <score> |

## 3. WTF list

Ranked by score.

### 1. <short name of the moment>

- **Where:** <stage of the journey, screen, URL or file>
- **What happened:** <what the product did>
- **Expected:** <what a reasonable user expected, and where that expectation comes from>
- **Evidence:** <path of the screenshot, or numbered reproduction steps>
- **Reproduced:** twice, the second time in a clean session
- **Type:** WTF
- **Score:** <severity> x <reach> x <position> = <score>
- **Root cause:** <file and symbol, or a hypothesis that is not confirmed>
- **Proposed change:** <the screen, the new behaviour, the new copy word for word>

## 4. Existing WOW moments to protect

### 1. <short name of the moment>

- **Where:** <stage of the journey, screen, URL or file>
- **What happened:** <what the product did>
- **Expected:** <what a reasonable user expected>
- **Evidence:** <path of the screenshot, or numbered reproduction steps>
- **Type:** WOW
- **Score:** <severity> x <reach> x <position> = <score>
- **Flags:** <hidden, late, fragile, or "none">
- **What can break it:** <the change or the condition that removes the moment>

## 5. WOW opportunities

Ranked by score.

### 1. <short name of the moment>

- **Where:** <stage of the journey, screen, URL or file>
- **What happens now:** <the neutral moment, or the WOW that is hidden, late or fragile>
- **Evidence:** <path of the screenshot, or numbered reproduction steps>
- **Type:** missed WOW | hidden WOW
- **Score:** <severity> x <reach> x <position> = <score>
- **Proposed change:** <the screen, the new behaviour, the new copy word for word>
- **Depends on:** <the WTF that must be fixed first, or "nothing">

## 6. Coverage

| Stage | First-time | Power user | Evaluator | Phone, slow | Keyboard, screen reader |
| --- | --- | --- | --- | --- | --- |
| First impression | walked | walked | walked | walked | walked |
| Signup and onboarding | | | | | |
| First value | | | | | |
| Core loop | | | | | |
| Settings and billing | | | | | |
| Errors and edge cases | | | | | |
| Coming back after a break | | | | | |
| Leaving or cancelling | | | | | |

Use "walked", "partly" or "not reached" in each cell.

**Could not reach:** <each stage, screen or condition, with the reason>

**Unverified:** <each moment that you could not observe or reproduce, with what you saw and what is missing>

**Limits of the method:** <for example: the accessibility tree is a proxy for a screen reader, the seconds are from an automated walk>
