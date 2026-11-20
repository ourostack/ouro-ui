# Counts from real use

Ouro check names the floor: what a check can prove about a screen. Only a person can say whether the screen is good. Ouro check's `--handoff` kit puts a person in front of the app. This page is the third layer: counts from real use, for an app that is already in people's hands.

`createUseCounts` counts the moments a person got stuck, such as a press on a disabled control or a dialog closed without its action. An agent can read where those counts are high and know where to look first.

```ts
import { createUseCounts } from "@/lib/ouro/use-counts";

const counts = createUseCounts({ onReport: (report) => myAnalytics.send(report) });
if (userAgreedToCounts) counts.enable();

counts.record("disabled-press", { screen: "checkout", part: "pay-button" });
counts.flush();
```

## Privacy statement

- **Off by default.** A counter records nothing until your code calls `enable()`. Ask the person first, and call `disable()` when they say no.[^off]
- **Counts only.** A report is a day and a list of counts. Each count names a moment, a screen and a part, and how many times it happened.[^shape]
- **Content stays out.** The report has fields for a day, a moment, a screen, a part and a count, and no field for what a person typed.[^shape] You must pass fixed screen and part names from your code, not typed text. As a safety net, a name that does not look like a short code name is counted as `other`, but a short word that looks fine passes through, so the safety net is not a promise.[^shape]
- **People stay anonymous.** It holds no person, device, session or account, and no time finer than the day.[^shape]
- **You own the destination.** Ouro UI runs no server and sends nothing.[^quiet] The counts go only where your `onReport` sends them. You own that place, and you tell people about it in your own privacy notice.[^quiet]
- **Memory only.** It uses no cookie and no storage.[^quiet] The counts live in memory and are gone when the page closes.[^quiet]

## What it counts

| Moment | A person got stuck when they |
| --- | --- |
| `field-error-left` | left a field that showed an error |
| `confirm-cancelled` | cancelled a confirm sheet |
| `undo-after-press` | undid something straight after a press |
| `disabled-press` | pressed a control that was disabled |
| `dialog-dismissed` | closed a dialog without its action |
| `search-empty` | a search came back empty |
| `repeated-press` | pressed the same control again and again |

Your code calls `record` where the moment happens. Pass names from your code, such as `checkout` and `pay-button`, never what a person typed.

## Prior art

Meerkat mode looked around first. The ideas are not new, and we borrowed the narrow parts. [Plausible](https://plausible.io/data-policy) avoids personal data and cookies, which we borrow as the default. [Web Vitals](https://github.com/GoogleChrome/web-vitals) hands measurements to your own code and leaves where it goes to you, which we borrow as `onReport`. Rage clicks in [Microsoft Clarity](https://learn.microsoft.com/en-us/clarity/) inspired `repeated-press`, but Clarity records sessions, which we ignore. Session replay such as [rrweb](https://github.com/rrweb-io/rrweb) records content, which we ignore.

[^off]: test:registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > records nothing and sends nothing by default verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > records nothing and sends nothing by default)
[^shape]: test:registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > a report holds only a day and counts, and text that could identify someone is counted as other verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > a report holds only a day and counts, and text that could identify someone is counted as other)
[^quiet]: test:registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > uses no network, storage or cookie, even when enabled and flushed verify:testExists(registry/ouro/lib/ouro/use-counts.test.ts::createUseCounts > uses no network, storage or cookie, even when enabled and flushed)
