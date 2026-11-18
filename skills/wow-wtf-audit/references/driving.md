# Drive the product, take evidence, measure

Read this file before the first walk.

## Use the product in the way its user does

| Product | Drive it with | First value is usually |
| --- | --- | --- |
| Web app | The browser tool that you have. With none, a Playwright script. | The first result made from the own input of the user |
| Mobile app | An emulator or a simulator, if you have one | The same |
| CLI | A clean shell, with no config from an earlier run | The first command that does the job with success |
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

For a CLI or an API, the evidence is the exact command or request, the full output, and the exit code or the status.

## Start a product from its repository

- Follow the README or the `Makefile`, and do nothing else.
  Each step that the README does not have, and each error on the way, is a moment for a developer product.
- Note the commit and the port.
- Do not read the source on the way.
  The first-time walk comes first.
- Stop the process when the audit ends.

## What your browser tool must do

- Take a screenshot.
- Start a clean session: no cookies, no storage.
- Set a phone viewport with touch.
- Throttle the network and the CPU, and go offline.
- Send key presses, and report which element has the focus.
- Read the accessibility tree.
- Delay or fail one request.

If your tool lacks one of these, use a Playwright script for that part.
If you cannot do a part at all, list it under "could not reach".

## Playwright

These calls are the ones that are not obvious.
They need Chromium, because the throttle uses the Chrome DevTools Protocol.

```javascript
import { chromium, devices } from 'playwright';

const browser = await chromium.launch();

const cleanSession = await browser.newContext();

const phone = await browser.newContext({ ...devices['iPhone 13'] });
const page = await phone.newPage();
const devtools = await phone.newCDPSession(page);
await devtools.send('Network.enable');
await devtools.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: 200_000,
  uploadThroughput: 93_750,
});
await devtools.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await phone.setOffline(true);
await phone.clearCookies();

await page.route('**/api/invoices', (route) => route.abort());
await page.route('**/api/invoices', (route) => route.fulfill({ status: 500 }));
await page.route('**/api/invoices', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await route.continue();
});

await page.keyboard.press('Tab');
const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200));

const accessibilityTree = await page.locator('body').ariaSnapshot();

const sidewaysScroll = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);

await page.screenshot({ path: 'evidence/WTF-01-name.png' });
```

- The throughput values are in bytes per second.
  The values above are about 1.6 Mbit/s down, 750 kbit/s up and 150 ms of latency, with a CPU that is 4 times slower.
  That is the slow 4G profile that Lighthouse uses for a mid-range phone.
- The three `page.route` calls are alternatives.
  When more than one handler matches a URL, the one that you added last runs, so remove a handler with `page.unroute` before you add the next one.
- `phone.clearCookies()` in the middle of a flow is the expired session.
- A real double click is `page.locator(...).dblclick()`.
- To walk with the keyboard, press Tab until the focus returns to the first control, and log the focused element after each press.
  A control that is not in the log cannot be reached.

## Evidence

- Name each file after the record: `evidence/WTF-03-signup-cleared.png`.
- Take the screenshot at the moment of the broken expectation, with the URL or the screen name in the record.
  For a wait, take one screenshot in the middle of the wait.
  For lost work, take one before and one after.
- Write steps that a person can follow with no other help: the URL, the account, each value that you typed, each control that you used, by its visible label.
- Do not put a password, a token or personal data of a real person in a screenshot or in the steps.
  The test account that the user gave you is the exception.

## Time to first value

Count on the first-time walk, from the first screen to first value:

- **Clicks:** each click or tap.
- **Fields:** each field that the user must fill.
- **Seconds:** see below.

Your own thinking time is not the time of the product.
So write the path down on the first walk, replay it as a script from a clean session, and report two numbers:

- The seconds that the product made the user wait: page loads and responses, added up.
- An estimate for a person: the waits, plus 2.5 seconds for each click, and 3 seconds plus 0.3 seconds for each typed character for each field.
  These values are from the Keystroke-Level Model: 1.35 seconds to think, 1.1 to point, 0.2 to click, 0.4 to move the hand to the keyboard, 0.28 for each key.
  Say in the report that it is an estimate.

Report the path with the numbers, for example "9 clicks, 10 fields, 6 seconds of waiting, about 75 seconds for a person: landing, signup, list, new invoice, submit".

## Waits

Time each wait: from the action to the first feedback, and from the action to the result.

| Wait | The user |
| --- | --- |
| Under 0.1 second | Feels that the product reacts at once |
| Under 1 second | Stays in the flow |
| Over 1 second | Needs feedback that the product works |
| Over 10 seconds | Turns to other work, and needs progress and a way to come back |

A wait over 1 second with no feedback is a WTF.
Its severity grows with the length of the wait and with what the user sees: a blank screen is worse than the old content.
