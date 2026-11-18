# Scoring and ranking

Score = severity x reach x position.
The lowest score is 0.1 and the highest is 15.
Give the three factors in each record, so that the reader can disagree with one factor and not with the whole score.

## Severity

For a WTF, severity is the damage.

| Severity | A WTF |
| --- | --- |
| 5 | The user cannot do the core job, loses work or data, or meets a cost or a permission request that nothing announced |
| 4 | The user is stopped, and continues only with a workaround or with help |
| 3 | The user gets through after a retry, an unexplained wait, or a second read |
| 2 | The user sees the problem and loses a little time or confidence |
| 1 | Cosmetic |

For a WOW and a missed WOW, severity is the strength of the moment.
For a missed WOW, score the moment as it is after the proposed change.

| Severity | A WOW |
| --- | --- |
| 5 | The core job is done in a fraction of the expected time, or the user would show the result to another person |
| 4 | The product anticipates the next step, or forgives a mistake, on the critical path |
| 3 | The product saves effort that the user can feel |
| 2 | A detail that shows care |
| 1 | Decoration |

## Reach

Reach is the share of the users at that stage who hit the moment, from 0 to 1.
Position holds the users who left earlier, so do not count them a second time.

Use analytics when the user gives them, and name the source.
With no data, estimate with these bands and say that the number is an estimate.

| Reach | Who hits the moment |
| --- | --- |
| 1.0 | Each user who gets to the stage, because it is on the only path |
| 0.6 | Most users, on the common path |
| 0.3 | Some users: a common mistake, a second feature, a phone |
| 0.1 | Few users: a rare edge case, a small group |

## Position

| Position | Stage |
| --- | --- |
| 3 | Before first value: first impression, signup and onboarding, first value |
| 2 | The core loop |
| 1 | After it: settings and billing, coming back after a break, leaving or cancelling |

An error or an edge case has the position of the stage where the user hits it.

## Ranking rules

1. Rank the WTF list by score, highest first.
2. Rank the WOW opportunities by score, highest first.
   The missed WOW moments and the hidden WOW moments are both in this list.
3. On equal scores, the earlier moment in the journey goes first.
4. Do not change the order because a change is cheap or expensive to implement.

## The top 5 actions

An action is one change.
One action can close more than one moment that has the same root cause, and then it names each of them.

- A WTF with a severity of 3 or more goes before each WOW action, in score order.
- A WTF with a severity of 1 or 2 competes with the WOW actions by score.
  On equal scores, the WTF goes first.
- A WOW action that is on the same path as an open WTF goes after the fix for that WTF.
  A WOW followed by a WTF is remembered as a WTF.
- Decoration is not an action, unless the moment below it works already.

When the top 5 has only WTF fixes, that is a correct result.
Say in the verdict that the product must first stop the loss of trust.

## Existing WOW moments

List each one in the "to protect" section with its score.
Add a flag when one of these is true:

- **Hidden**: the user must find a setting or a menu to get it.
- **Late**: it comes after the point where most users have left.
- **Fragile**: it fails on a common input, on a phone, or with the keyboard.

A flagged WOW also goes to the WOW opportunities, with the change that brings it forward.

## Worked examples

A signup form clears each field after a password error, and the form did not state the password rule.
Severity 5, because the user loses the work.
Reach 0.6, because most first passwords fail a rule that nobody stated.
Position 3, because it is before first value.
Score 5 x 0.6 x 3 = 9.

The delete action in a list shows "Deleted. Undo" for eight seconds.
It is a WOW with a severity of 4, because it forgives a mistake on the critical path.
Reach 0.3, because some users delete an item in a session.
Position 2, the core loop.
Score 4 x 0.3 x 2 = 2.4.

A dialog cannot be closed with the keyboard.
Severity 5 for a keyboard user, because the user is trapped.
Reach 0.1, a small group.
Position 2.
Score 5 x 0.1 x 2 = 1.
Mark it "blocks a group", so that the reader sees a blocker behind the low score.
