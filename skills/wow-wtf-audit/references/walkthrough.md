# The walk: stages, lenses, states and wrong things

Read this file when you walk a stage or a lens, force a state, or do the wrong thing on purpose.
The lists of the stages and the lenses are prompts for your attention, not a checklist to fill in.
Record only what you observed.

## Stages

Walk the stages in this order.
An earlier stage has more weight, as the position table in `SKILL.md` says.

| Stage | The question of the user | A WTF is often here | A WOW is often here |
| --- | --- | --- | --- |
| 1. First impression | What is this, is it for me, what do I do next? | The first screen does not say what the product does. A cookie, notification or location request comes before any value. The price or the limits are not there. | The user can try the core job with their own input before signup. |
| 2. Signup and onboarding | What must I give before I get something? | A field that first value does not need. A password rule that shows only after submit. An error that clears the form. A tour that the user cannot skip. A card asked for before value. | No signup until the user wants to keep the result. Fields filled in from what the product knows. |
| 3. First value | Did it work, and what do I have now? | No confirmation that the job is done. The result cannot be used at once: no link, no export, no next step. An empty screen with no first action. | The result arrives sooner than the user expected, and is ready to share. |
| 4. The core loop | Is the tenth time better than the first? | The product forgets the last choice. Two names for one thing. No feedback after an action. No undo. A wait on each repeat. | Sensible defaults from the last use. Duplicate, templates, bulk actions, shortcuts. Undo in place of "Are you sure?". |
| 5. Settings and billing | What does it cost, what are the limits, who can see my data? | A limit or a price that shows up only when the user hits it. A setting that saves with no feedback. A plan that is hard to find or to compare. | The limits are stated before the user hits them, with the count that is left. |
| 6. Errors and edge cases | What now? | See "States" and "Wrong things" below. | A mistake is forgiven: the input is kept, the action can be undone. |
| 7. Coming back after a break | Where was I? | The user lands on a generic page. The session ended and the work is lost. The last item is hard to find. | The product opens where the user stopped, and shows what changed. |
| 8. Leaving or cancelling | Can I get out, and can I take my data? | No cancel or delete in the product: the user must write an email or make a call. No export. Copy that makes the user feel guilty. | One clear path, an export in one step, a plain statement of what happens to the data. |

For stage 7, open a new session with the stored login, and then one with no login.
You cannot observe a thing that needs days to pass, such as a trial that ends or a reminder email.
List it under "could not reach".

For stage 8, find the path and count its steps, and stop before the last confirmation.

## Lenses

Run the four lenses after the first-time walk in parallel when you can start subagents and each one has its own account or its own instance of the product.
Do not create accounts on a shared instance to make this possible.
With one shared account, run the lenses one after another, because the records of one walk change what the next one sees.
Give each subagent this skill, the frame from `walk-log.md`, the moments found so far, its lens, and its account or instance.
You do the scoring and the ranking yourself, after all of them report.

### First-time user with no context

- Start from a clean session: no cookies, no stored login, no knowledge from the code or the docs.
- Do the first-screen test.
  Take one screenshot of the first screen with no scroll.
  From that screenshot alone, write down what the product is, who it is for, and what to do next.
  If you cannot, that is the first record.
- Open the docs only when the product sends you there, and record that it did.

### Daily power user

- Use an account that has data.
  If the test account is empty, create ten or more records of your own first, or as many as the product allows.
- Do the core job five times in a row.
  Each step that is the same all five times is a candidate for a default, a shortcut or a bulk action.
- Look for keyboard shortcuts, search, filter, sort, duplicate, templates, undo, and a URL for each item that the user can share.
- Open the largest list.
  Does it stay fast, and can the user find one item in it?

### Skeptical evaluator

This person decides in a few minutes whether the product is worth their time, and compares it with the competitors.

- Write down each claim on the landing page, and mark each one as true, false or not checked against what you observed.
  A claim that the product does not keep is a WTF, with the promise as the source of the expectation.
- Look for the answers that a buyer needs before they commit: the price and the limits, what happens to the data, how to leave, who is behind the product, where the docs and the support are.
- Compare with each competitor on the same job, from public pages only: the steps to first value that the competitor shows, the price, and the main claim.
  Record where the product is behind as a WTF or a missed WOW, and where it is ahead as a WOW to protect.

### A phone with a slow connection

- Use a phone viewport with touch, and throttle the network and the CPU.
  The setup is in `driving.md`.
- Look for sideways scroll, a control outside the screen, content under a fixed bar, and a tap target smaller than 24 by 24 CSS pixels.
- Look at what the user sees while the page loads: a blank screen, a layout that jumps, or content that shows up in a useful order.
- Check that a tap gives feedback at once, also when the response is slow.
- Check that each input opens the right keyboard.
  An emulated phone has no keyboard on the screen, so read the `type`, `inputmode` and `autocomplete` of each input.
  A text size under 16 pixels in an input makes iOS Safari zoom in on focus.
  Chromium does not show that zoom, so read the computed `font-size` of each input.

### Keyboard and screen reader

- Use only Tab, Shift+Tab, Enter, Space, the arrow keys and Escape.
  Do not click.
- Each control is reachable, in an order that follows the screen, with a focus mark that you can see in a screenshot.
- Read the accessibility tree and not the pixels.
  Each control has a name that says what it does, each field has a label, and each page has a title and headings.
  A button with only an icon often has no name.
- A dialog takes the focus when it opens, keeps it inside, closes on Escape, and gives the focus back to the control that opened it.
- An error, a toast and the count of search results are announced.
  Look for `alert`, `status` or `log` in the accessibility tree, and for `aria-live` in the DOM, because the tree does not show it.
  A message that takes the focus needs none of these.
- An accessibility tree is not a screen reader.
  Say in the Coverage section which of the two you used.

## States

Visit the four states on each key screen.

| State | How to get there | A good state |
| --- | --- | --- |
| Empty | A new account, a search with no result, a filter that hides each item | Says what belongs here, and offers the first action |
| Loading | Throttle the network, or delay one response | Gives feedback inside 1 second, shows progress for a long task, and keeps the rest of the page usable |
| Error | Fail one request, go offline, send input that the server rejects | Says in the words of the user what happened and what to do, keeps the input, and lets the user try again |
| Partial | One item, very many items, very long text, optional data that is missing, one failed request of several, a setup that is half done | The layout holds, and no text reads `undefined`, `null` or `NaN` |

A request that you delay or fail in your own browser does not change the product, so the audit stays read-only.

## Wrong things

Do each of these on each key flow.
After each one, check for lost work first, because lost work can be severity 5.
On the signup flow, do only the wrong things that create no account, unless the instance is your own.
Do not create an account only to reach the empty state.

| Wrong thing | How | A good product |
| --- | --- | --- |
| Empty input | Submit the form empty, then with one required field missing at a time | Says which field and why, and keeps the other fields |
| Huge input | A text of 10,000 characters, a long word with no spaces, a very large number, a negative number, emoji and non-Latin text | Accepts it, or states the limit before submit, and the layout holds |
| Back button | Go back after each step of a flow, then forward | Returns to the step with the input in place, and does not submit twice |
| Refresh | Reload with a form that is half filled, and in the middle of a flow with more than one step | Keeps a draft, or warns before the page unloads |
| Double click | Double-click each button that creates or saves a record of your own. Do not double-click a button that pays, sends to a person, or cannot be undone. | One result |
| Expired session | Delete the session cookie or token in your own browser in the middle of a flow, then go on | Says that the session ended, and returns to the same place with the input after login |
| No connection | Go offline before a submit, and in the middle of a load | Says so, keeps the input, and tries again or lets the user try again |

Then try what fits the product: a deep link while logged out, the same flow in two tabs, a paste with spaces around the value, a date or a number in a different local format.
