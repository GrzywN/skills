# Drive the product, take evidence, measure

Read this file before the first walk.

## Use the product in the way its user does

| Product | Drive it with | First value is usually |
| --- | --- | --- |
| Web app | The browser tool that you have. With none, a Playwright script. | The first result made from the user's own input |
| Mobile app | An emulator or a simulator, if you have one | The same |
| CLI | A shell with `HOME` set to a new temporary directory, so that no config from an earlier run is there | The first command that does the job with success |
| API or SDK | The quickstart of the docs, typed out as a new developer does | The first call that returns the data of the user |

For a mobile app with no emulator, walk the mobile web version in a phone viewport, and list the native app under "could not reach".

The stages fit each type of product.

| Stage | Web or mobile app | CLI | API or SDK |
| --- | --- | --- | --- |
| First impression | Landing page, store page | README, `--help` | Docs home, quickstart |
| Signup and onboarding | Signup, tour | Install, login, config | Get a key, install the SDK |
| First value | The first result | The first command that works | The first call that works |
| The core loop | The repeated job | The daily commands, in scripts and pipes | The main endpoints, pagination, rate limits |
| Settings and billing | Settings, plan, invoices | Config file, flags, limits | Dashboard, usage, quota |
| Errors and edge cases | The states and the wrong things | Wrong flags, exit codes, Ctrl+C in the middle | Error bodies, status codes, retries |
| Coming back | A new session | An upgrade to a new version | A version change, a key that expired |
| Leaving | Cancel, delete, export | Uninstall, what is left on the disk | Delete the key, export the data |

For a CLI or an API, read the other parts of the audit in this way.

- The first screen is the top of the README and the output of the bare command.
- The phone lens is a terminal of 80 columns, a slow network, and output that goes to a pipe or a CI log.
- The screen reader lens is plain output: `NO_COLOR=1`, no spinner, and no meaning that only a colour or a symbol carries.
- The four states are: no input, a long run, a failure, and a run that stops in the middle.
- The wrong things are: no argument, a wrong flag, huge input, the same command twice, two runs at the same time, an expired token, no network, Ctrl+C.
- Count commands in place of clicks.
- Do not touch the real config of the user.

A lens that has no meaning for the product is "not applicable" in the Coverage table.

For a CLI or an API, the evidence is the exact command or request, the full output, and the exit code or the status.

## Start a product from its repository

An instance that you start from the repository is your own when it has its own database and no live keys for email or payment.
Check its configuration before you rely on that: the environment files, the compose files and the README, not the source.
If you cannot tell, the instance is not your own, and each read-only rule of `SKILL.md` holds as it is written.

In your own instance you can do four things that the read-only rules do not allow in other places:

- Sign up with an `@example.com` address.
- Send a message of the core job to an `@example.com` address.
- Save a setting of your own account.
- Start the instance again to get fresh data.

Start it in this way:

- Follow the README or the `Makefile`.
  Each step that the README does not have, and each error on the way, is a WTF for a developer product.
- You can take a setup step that the README lacks when it changes no tracked file, such as an install of dependencies or a copy of an example config.
  Record that step as a WTF, and list what it created under "Created by the audit".
- Note the ID of each process that you start, and stop only those when the audit ends.
- Note the commit and the port.
- Do not read the source on the way.
  The first-time walk comes first.
- The log of the server that you started is behaviour, not source.
  Read it when a request fails.

## What your browser tool must do

- Take a screenshot.
- Start a clean session: no cookies, no storage.
- Set a phone viewport with touch.
- Throttle the network and the CPU, and go offline.
- Send key presses, and report which element has the focus.
- Read the accessibility tree.
- Delay or fail one request.
- Run a script that measures time.

If your tool lacks one of these, use a Playwright script for that part.
Keep the script in the output directory, and install nothing into the product.
If you cannot do a part at all, list it under "could not reach".

## Playwright

These are the calls that are not obvious.
The throttle needs Chromium, because it uses the Chrome DevTools Protocol.

```javascript
import { chromium, devices } from 'playwright';

const browser = await chromium.launch();
const phone = await browser.newContext({ ...devices['iPhone 13'] });
const page = await phone.newPage();

const devtools = await phone.newCDPSession(page);
const slowNetwork = { latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };
await devtools.send('Network.emulateNetworkConditions', { offline: false, ...slowNetwork });
await devtools.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await devtools.send('Network.emulateNetworkConditions', { offline: true, ...slowNetwork });
await phone.clearCookies();

await page.route('**/api/orders', (route) => route.abort());
await page.route('**/api/orders', (route) => route.fulfill({ status: 500 }));
await page.route('**/api/orders', async (route) => {
  const response = await route.fetch();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await route.fulfill({ response });
});
await page.route('**/api/orders', async (route) => {
  await route.fetch();
  await route.abort();
});

const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200));
const accessibilityTree = await page.locator('body').ariaSnapshot();
const sidewaysScroll = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
```

- A new context is a clean session.
- The throughput values are in bytes per second.
  The values above are the Slow 4G preset of Chrome DevTools: about 1.4 Mbit/s down, 675 kbit/s up and 562.5 ms of latency.
  The CPU that is 4 times slower is what Lighthouse uses for a mid-range phone.
- The throttle is for one page.
  A new tab or a popup needs its own DevTools session.
- Compare `scrollWidth` with `clientWidth` and not with `window.innerWidth`.
  On an emulated phone, `innerWidth` grows with the content, so that check does not find the sideways scroll.
- The second `Network.emulateNetworkConditions` call cuts the connection.
  In a context with this throttle, `context.setOffline(true)` has no effect.
  In a context with no throttle, use `context.setOffline(true)`.
- The four `page.route` calls are alternatives: a request that fails, an error of the server, a late answer, and an answer that is lost after the server did the work.
  A delay before `route.continue()` holds the request in the browser, so the server does not get it in that time.
  When more than one handler matches a URL, the one that you added last runs.
  `page.unroute('**/api/orders')` removes them and gives the real response back.
  The pattern `**/api/orders` matches only that path, not `/api/orders/7` and not `/api/orders?page=2`.
- `clearCookies()` in the middle of a flow is the expired session, when the session is a cookie.
  For a token in the storage, clear `localStorage` and `sessionStorage` in the page too.
- A double click is `locator.dblclick()`.
- On an emulated phone, a page that is wider than the screen does not act as on a real phone.
  `locator.tap()` and `locator.click()` time out on a control outside the screen, and `window.scrollTo` does not move the page.
  Use `page.touchscreen.tap(x, y)` at the centre of the bounding box of the control, and record that a person needs a sideways swipe to get there.
- To walk with the keyboard, press Tab until the focus returns to the first control, and log the focused element after each press.
  A control that is not in the log cannot be reached with Tab.
  Check a radio group, a tab list or a menu with the arrow keys.
  In a shadow root or an iframe, `document.activeElement` is the host, so read the focus inside it.

## Evidence

- Name a screenshot that you take for a record after its ID: `evidence/WTF-03-import-28-of-240.png`.
  A screenshot from a walk keeps its name, and the record gives its path.
- Take the screenshot at the moment of the broken expectation, with the URL or the screen name in the record.
  For a wait, take one screenshot in the middle of the wait.
  For lost work, take one before and one after.
- Write steps that a person can follow with no other help: the URL, the account, each value that you typed, each control that you used, by its visible label.
- Do not put a password, a token or personal data of a real person in a screenshot or in the steps.
  The test account that the user gave you is the exception.

## Waits

You cannot time a wait across two tool calls, because the round trip of a tool call is longer than the wait.
Time it inside one script.

```javascript
const started = Date.now();
await page.getByRole('button', { name: 'Save' }).click();
const result = page.getByRole('status').waitFor().then(() => (Date.now() - started) / 1000);
await page.waitForTimeout(1000);
await page.screenshot({ path: 'evidence/WTF-05-one-second-after-save.png' });
const secondsToResult = await result;
```

- Start to wait for the result before the timeout, as the sample does, or each wait reads as more than 1 second.
- The screenshot after 1 second shows if the user has feedback by then: a spinner, a disabled button, a message.
  If the result is in the screenshot, the wait was under 1 second.
- `secondsToResult` is the length of the wait.
- For a page load, read `performance.getEntriesByType('navigation')[0]` in the page.

A wait over 1 second with no feedback is a WTF.
After 10 seconds a user turns to other work, and needs progress and a way to come back.
A blank screen is worse than the old content.
The severity of a wait is in the score section of `SKILL.md`.

## Time to first value

Count on the first-time walk, from the first screen to first value, on the shortest path that works:

- **Clicks:** each click or tap that is not a click into a field.
- **Fields:** each field that the user must fill.
- **Characters:** each character that the user must type.

Then replay the path as a script from a clean session, and report two numbers of seconds:

- The seconds that the product made the user wait: page loads and responses, added up.
- An estimate for a person: the waits, plus 2.5 seconds for each click, 3 seconds for each field, and 0.3 seconds for each character.
  These values are from the Keystroke-Level Model: 1.2 seconds to think, 1.1 to point, 0.2 to click, 0.4 to move the hand to the keyboard, 0.28 for each key.
  The model is for a practised user who makes no errors, so for a first-time user the estimate is a lower limit.
  Say that in the report.

Report the path with the numbers, for example "9 clicks, 10 fields, 90 characters, 6 seconds of waiting, at least 85 seconds for a person: landing, signup, dashboard, new project, publish".
