# The walk

This file has the stages, the lenses, the wrong-thing actions, the states, the time to first value and the browser calls for the walk.

## Stages by product type

The stage decides the position weight of a moment in `references/scoring.md`.

| Stage | Site, web app or mobile app | CLI or library | API |
| --- | --- | --- | --- |
| First impression | Landing page, pricing, app store page | README, install command, `--help` | Docs home, quickstart |
| Signup and onboarding | Signup, email check, setup wizard | Install, login, config, `init` | Get a key, first authenticated call |
| First value | The first result of the core job | The first command that does the job | The first call that returns a real result |
| Core loop | The screens of each day | The commands of each day, scripts, pipes | The main endpoints, pagination, webhooks, the SDK |
| Settings and billing | Profile, team, plan, invoices | Config file, flags, upgrade to a paid plan | Key rotation, rate limits, usage, plan |
| Errors and edge cases | Each wrong-thing action and each state below | Wrong flags, missing files, no network, exit codes, stderr | 4xx and 5xx bodies, validation messages, rate limit headers |
| Coming back after a break | Login after weeks, password reset, changed UI | Update to a new version, expired token, old config | Expired key, deprecations, changelog |
| Leaving or cancelling | Cancel the plan, export data, delete the account | Uninstall, leftover files, export | Delete a key, export, close the account |

An error or an edge case has the position of the stage where the user hits it.
A signup error is before first value.

## Lenses

A CLI or an API has no screen.
There, the phone lens is a slow or a broken network, and the keyboard and screen reader lens is output with no colour and output that goes to a pipe or a file.

### First-time user with no context

- Setup: a fresh browser profile, and a fresh account when the rules allow one, before you read the code or the docs.
- Use only what the screen shows, and click each control by its visible text or its role.
- Look for: jargon, a step with no reason, a choice with no default, a required field that the user cannot fill yet, a point where the next step is not clear.
- Measure the time to first value here.

### Daily power user

- Setup: an account with real amounts of data, usually the test account.
- Do the core loop five to ten times with no break.
- Look for: clicks that repeat each time, no keyboard shortcuts, no bulk actions, slow lists, filters and defaults that the product forgets, no undo, no edit.
- Existing WOW moments are often here, and often hidden in settings.
  Open each settings section, also the closed ones.

### Skeptical evaluator

- Setup: none.
  Start at the landing page and the pricing page.
- Write down each promise of the product, then check each one in the product.
  A promise that the product breaks is a WTF, most of all a price promise.
- Look for: limits that show only after the work is done, lock-in with no export, missing signs of trust such as a status page or a security page.
- For each competitor that the user named, ask what a user of that competitor expects and does not find here.
  Compare only with what you can observe now on the public pages of the competitor.

### Phone on a slow connection

- Setup: a viewport of about 375 by 667 pixels with touch, and a throttled network, for example 400 ms of latency and 400 kbit/s.
- Look for: horizontal scroll, a main button that is off the screen, touch targets below 24 by 24 CSS pixels, a main button below 44 by 44, a wrong keyboard type for a field, layout that jumps, a wait with no feedback.

### Keyboard and screen reader

- Setup: no mouse.
- Press Tab through each key screen.
  Each control can be reached, the focus is visible, and the order follows the screen.
  A control that you clicked in the first walk and that Tab does not stop on is a WTF.
- A dialog keeps the focus inside until it closes, closes with Escape, and gives the focus back to the control that opened it.
  No other part of the page keeps the focus.
- Read the accessibility tree of each key screen.
  Each control has a role and a name, each image has a text alternative, and the page title changes with the page.
- The accessibility tree does not show all problems.
  A field with only a placeholder looks as if it has a name, so look for a `label` in the DOM.
  A `div` with a click handler shows as plain text, so compare the tree with the controls that you clicked.
  The link from an error to its field is `aria-describedby` in the DOM.

## Wrong-thing actions

Do each action on each key screen that has a control for it.

| Action | A good product | Signs of a WTF |
| --- | --- | --- |
| Empty input | Says which field is missing, and keeps the other fields | A general error, a cleared form, a click with no effect |
| Huge input: 10,000 characters, a 5 MB file, 1,000 rows | States the limit before the work, and the layout holds | A limit after the upload, broken layout, a timeout |
| Back button | Goes to the earlier state, and keeps the form | Lost input, a second submit, a loop |
| Refresh in the middle of a flow | Keeps the draft, or warns before the loss | An empty form, a restart of the wizard |
| Double click on a submit control | One result | Two records, two charges, two emails |
| Expired session | Says so, sends the user to the login, then returns to the same place with the work kept | An empty screen, a silent failure, lost work |
| No network | Says so, keeps the input, offers a retry | A spinner with no end, a silent failure |

A double click and a refresh send real requests.
Do not use them on a control that pays, cancels a plan, deletes an account or sends a message to a real person.

## States

Visit each state on each key screen.

| State | How to get there | A good product | Signs of a WTF |
| --- | --- | --- | --- |
| Empty | A new account, a search with no result, a filter that excludes all | Says why it is empty, and offers the next step | Table headers with no rows, a blank page |
| Loading | A request that you delay by three seconds | Feedback within about one second, progress for a wait above ten seconds | A control that stays active with no change, a spinner with no end |
| Error | Invalid data, no network, a request that you abort or answer with a 500 | Says what went wrong in the words of the user, keeps the work, offers a way forward | An error code, "Something went wrong", lost input |
| Partial | One item, a very long name, a missing optional field, one of several requests failed | The screen still works and shows what is missing | Broken layout, `undefined`, a total that is wrong |

A throttled network adds less than a second to a small request.
To see the loading state, delay the request.

## Time to first value

Start at the first screen that a new user sees.
Stop when the user has the first result of the core job.

Report five numbers: the clicks, the fields that the user types, the screens, the seconds of waiting that the product causes, and the seconds of the whole path.
For the seconds of the whole path, run the path in one script after the walk, and call the number a lower limit.

Then list the steps before first value, and mark each step that the core job does not need.
Each such step is a candidate for a WTF or a missed WOW.

## Playwright calls

These calls cause the conditions above in a browser that you control.
They start with `const { chromium, devices } = require('playwright')`.

| Condition | Call |
| --- | --- |
| Fresh user | `browser.newContext()` |
| Phone | `browser.newContext({ ...devices['iPhone SE (3rd gen)'] })` |
| Slow connection, Chromium only | `const cdp = await context.newCDPSession(page)`, then `await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 })` |
| No network | `await context.setOffline(true)` |
| No network, on a page that has the throttle | The call for the slow connection with `offline: true` |
| A slow request | `await page.route('**/api/**', async (route) => { await new Promise((done) => setTimeout(done, 3000)); await route.continue() })` |
| A request that fails | `await page.route('**/api/**', (route) => route.abort())` |
| A server error | `await page.route('**/api/**', (route) => route.fulfill({ status: 500 }))` |
| Expired session | `await context.clearCookies()`, and `await page.evaluate(() => localStorage.clear())` when the token is in storage |
| Back and refresh | `await page.goBack()`, `await page.reload()` |
| Double click | `await locator.dblclick()` |
| Click as a user does | `page.getByRole('button', { name: 'Save' })`, `page.getByText('Add line item')` |
| Keyboard walk | `await page.keyboard.press('Tab')`, then `await page.evaluate(() => { const e = document.activeElement; return [e.tagName, e.id, e.textContent.trim().slice(0, 40), getComputedStyle(e).outlineStyle] })` |
| Accessibility tree | `await page.locator('body').ariaSnapshot()` |
| Page title | `await page.title()` |
| Size of a touch target | `await locator.boundingBox()` |
| Horizontal scroll | `await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)` |
| Screenshot | `await page.screenshot({ path })`, with `fullPage: true` only when you need the whole page |

- The throughput values are in bytes per second: 50,000 is 400 kbit/s.
- The throttle is for one page.
  A new tab needs its own CDP session.
- On a page that has the throttle, `context.setOffline(true)` does not stop the requests.
  Send the throttle call with `offline: true`, or call `await cdp.detach()` first, which removes the throttle.
- Compare the scroll width with `clientWidth` and not with `window.innerWidth`, because a phone zooms out on a page that is too wide and `innerWidth` grows with it.
- A screenshot of the whole page does not show what is off the screen of a phone.
- Take a screenshot after each step, so that the one before a moment is the "before" picture.
