# Scoring and ranking

Score = severity x reach x position.
With the bands below, the lowest score is 0.1 and the highest is 15.
Give the three factors in each record, so that the reader can disagree with one factor and not with the whole score.

## Severity

For a WTF, severity is the damage.

| Severity | A WTF |
| --- | --- |
| 5 | The user cannot do the core job, loses data or work that takes more than a minute to do again, or meets a cost or a permission request that nothing announced |
| 4 | The user is stopped, and continues only with a workaround, a guess or help |
| 3 | The user gets through after a retry, an unexplained wait, a second read, or steps that the core job does not need |
| 2 | The user sees the problem and loses a little time or confidence |
| 1 | Cosmetic |

For a WOW and a missed WOW, severity is the strength of the moment.

| Severity | A WOW |
| --- | --- |
| 5 | The core job is done in a fraction of the expected time, or the user would show the result to another person |
| 4 | The product anticipates the next step, or forgives a mistake, on the critical path |
| 3 | The product saves effort that the user can feel |
| 2 | A detail that shows care |
| 1 | Decoration |

## Reach

Reach is the share of all the users of the product who hit the moment, from 0 to 1.
A moment in a stage that few users get to, such as an account deletion, has a low reach.

Use analytics when the user gives them, and name the source.
With no data, estimate with these bands and say that the number is an estimate.

| Reach | Who hits the moment |
| --- | --- |
| 1.0 | Each user, because the moment is on the only path |
| 0.6 | Most users, on the common path |
| 0.3 | Some users: a common mistake, a second feature, a phone |
| 0.1 | Few users: a rare edge case, a small group |

## Position

| Position | Stage |
| --- | --- |
| 3 | Up to first value: first impression, signup and onboarding, first value |
| 2 | The core loop |
| 1 | The other stages: settings and billing, coming back after a break, leaving or cancelling |

An error or an edge case has the position of the stage where the user hits it.

## Ranking rules

1. Rank the WTF list by score, highest first.
2. Rank the WOW opportunities by score, highest first.
   The missed WOW moments and the flagged WOW moments are both in this list.
3. In the WOW opportunities, score each moment as it is after the proposed change: severity, reach and position.
   In the "to protect" section, score each WOW as it is now.
4. On equal scores, the earlier moment in the journey goes first.
5. Do not change the order because a change is cheap or expensive to implement.

## The top 5 actions

An action is one change.
One action can close more than one moment that has the same root cause.
It names each of them, and it has the highest score of the moments that it closes.

- Each WTF fix goes before each WOW action.
  Order the WTF fixes by score, then the WOW actions by score.
- A WOW action on the same path as an open WTF names that WTF in "Depends on".
  A WOW followed by a WTF is remembered as a WTF.
- Decoration is not an action, unless the moment below it works already.
- With fewer than five actions, give fewer.
- List each "blocks a group" moment that is not in the top 5 in one line below the table.

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

A signup form answers a password that fails an unstated rule with "Invalid input." and clears each field.
Severity 4, because the user is stopped: the message does not name the field, and the user must guess the rule.
Reach 0.6, because most first passwords fail a rule that nobody stated.
Position 3, because it is before first value.
Score 4 x 0.6 x 3 = 7.2.

The delete action in a list shows "Deleted. Undo" for eight seconds.
It is a WOW with a severity of 4, because it forgives a mistake on the critical path.
Reach 0.3, because some users delete an item in a session.
Position 2, the core loop.
Score 4 x 0.3 x 2 = 2.4.

A dialog cannot be closed with the keyboard.
Severity 5 for a keyboard user, because the user cannot continue.
Reach 0.1, a small group.
Position 2.
Score 5 x 0.1 x 2 = 1.
Flag it "blocks a group", so that the reader sees a blocker behind the low score.

A feature that repeats the last piece of work with one click is behind a closed section of the settings.
In the "to protect" section it is a WOW with the flag "hidden": 5 x 0.1 x 1 = 0.5, because few users find it.
In the WOW opportunities, the proposed change puts the button on the main screen of the core loop: 5 x 0.6 x 2 = 6.
