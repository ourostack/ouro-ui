---
name: ouro-check
description: Use when you need to know whether a site, a built app or a page in a test looks, reads and moves right (design, layout, pictures, accessibility, jank, HTTPS) at phone, laptop and 4K sizes in light and dark, without looking at screenshots or recordings. Read its JSON findings; open a close-up only for the finding you are fixing. Also use it before you show a person a screen, mock or capture: it leads to the beauty gate.
---

# Ouro check

Ouro check opens every page at every size you give it, light and dark, and reports what is wrong as JSON, with a small captioned close-up of each finding.[^check-run] Pass and fail come from measurement, so you never need to view a whole page, a contact sheet or a video to know what to fix. [The screen check guide](https://ui.ouroboros.bot/docs/guardrails/#the-screen-check) lists every rule and what it measures.[^guide-rules]

## Run it

In an app built on Ouro UI, install it once and run it on the built folder or a URL:

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-check#<release>
node scripts/ouro/check/check.ts dist --sizes 390x844,1440x900,3840x2160
```

Anywhere else, such as a site you don't own, fetch its files from the newest release into a folder of their own, then point it at the URL:[^latest]

```sh
TAG=$(curl -fsSI https://github.com/ourostack/ouro-ui/releases/latest | sed -n 's#^location: .*/tag/\(v[^[:space:]]*\).*#\1#Ip')
mkdir -p .ouro-check && (cd .ouro-check && echo '{"private":true,"type":"module"}' > package.json && npm i -D playwright axe-core && npx playwright install chromium \
  && curl -fsSL "https://raw.githubusercontent.com/ourostack/ouro-ui/$TAG/registry.json" | jq -r '.items[] | select(.name == "ouro-check").files[].path' \
  | while read -r p; do curl -fsSLo "${p##*/}" "https://raw.githubusercontent.com/ourostack/ouro-ui/$TAG/$p"; done)
node .ouro-check/check.ts https://example.com/ https://example.com/about/ --sizes 390x844,1440x900,3840x2160
```

An app whose views have no address (an open chat, a call, a tab) is checked in them by listing the presses that reach each one under `states` in `ouro-check.json`, as Playwright selectors, then passing `--config ouro-check.json`.[^check-states] Each state is checked as a page of its own, named after the page and the state.[^check-states] A press that finds nothing shows up as the state's page not loading, so fix the selector first. List only presses that change what the page shows, and point the check at made-up data:

```json
{ "states": { "/?mock=1": { "a chat open": ["text=Launch planning"], "in the call": ["role=button[name=\"Join\"]"] } } }
```

It needs Node 22.18 or newer.[^node] Leave out `--sizes` to sweep every size from a 320px phone to a 3840px screen. `--themes light` narrows to one theme; `--no-measured` skips the timing rules and the walk. On a shared machine, run one check at a time: it runs one headless browser, never a visible one.

## Read the findings, not the pictures

The exit code says whether there is anything to fix: 0 nothing, 3 findings, 2 a usage problem, 1 the check itself stopped.[^check-exit] `ouro-check/summary.md` is a table of pages by rule. `ouro-check/report.json` has one entry per finding: `page`, `width`, `height`, `theme`, `rule`, `element` (named the same way at every size), `detail` (this size's numbers), `gated`, and `closeUp`, the path of its captioned picture.[^report]

Group the findings by rule and element, so one fix shows once with every size it appears at:[^report]

```sh
jq -r '.findings | group_by(.rule + .element)[] | "\(.[0].rule)\t\(.[0].element)\t\(length) spots\t\(.[0].detail)\t\(.[0].closeUp // "")"' ouro-check/report.json
```

Fix from `rule`, `element` and `detail`. A finding inside an Ouro component is yours to fix in your app's copy ([Changing a component](https://ui.ouroboros.bot/docs/installing/#changing-a-component)). Open the close-up only when those leave you unsure which element it means, and then only that one.

## Let text use its column

Let prose use the width its column gives it. Don't cap it with a reading measure (`max-width: 65ch`, `max-w-prose`, `46rem`) unless the design sets one; if it does, declare it at 40ch or wider, and the check leaves that text alone: read the cap from a custom property whose name begins `measure-`, add `data-ouro-measure` to the text, or set `measure` in `ouro-check.json`. `narrow-text` reports a cap that holds prose under three quarters of a column at least 900px wide, and names the rule that set the cap.[^skill-narrow-text]

## Avoid a frame inside a frame

`nested-frame` finds a lighter framed surface inside another frame, even when it is inset or the outer frame clips.[^skill-inset-frame] Drop the inner border.

## Place a popup where it settles

`popup-first-frame` opens the popups the page has and records their boxes as they settle.[^skill-popup-first-frame] It reports a popup that is drawn somewhere other than where it settles, not counting its own scale or fade, so place it there from its first frame, with `position: fixed` for a popup measured against the viewport.[^skill-popup-first-frame]

The panel rules read each open menu, popover, dialog, sheet and `data-ouro-panel`, including the popups the check opens.[^skill-panels] `empty-panel` is a panel mostly empty space, `wrapped-short-line` short words that wrap, `boxed-blurb` a decorative card of words with nothing to press, `panel-off-screen` a panel running past the bottom of the screen with nothing to scroll it, and `panel-clip` words its box cuts off. Size the panel to what it holds, give its columns room, drop the card's fill, cap its height and let it scroll.

## Fix, then prove it

Run the check again with the earlier report, and it writes a captioned before and after for each finding gone since:

```sh
node scripts/ouro/check/check.ts dist --before ouro-check/report.json --out ouro-check-after
```

Put the before and after in the pull request as the proof. A finding you keep on purpose gets `data-ouro-allow="<rule>"` and `data-ouro-allow-why="<reason>"` on the element; one without a reason does not count. `blurry-image` can't be waived: an allow or a waiver of it is itself a problem, so give the picture a larger source; `--images-report <file.json>` lists the blurry pictures with the files they drew and the widths they need. To let a new rule report without failing while its findings are fixed, waive it in `ouro-check.json` with the reason, and remove the waiver with the last fix.

## What it can't tell you

A clean report is the floor, not proof that a screen is good: what measurement can decide isn't broken. Whether people understand the screen and finish its task, such as whether they know a form saved or what an action will remove, shows only when you watch them do it, so before you call a screen good, watch a few people do its task.[^floor]

Ask of every element whether the people who made the Mac and the iPhone would ship it, and take out what hasn't earned its place ([the bar](https://ui.ouroboros.bot/docs/design-craft/#the-bar)). Before a person sees a screen, a mock or a capture of either, pass the beauty gate in [Design craft](https://ui.ouroboros.bot/docs/design-craft/#the-beauty-gate): put the captures beside their references at the same size, look at them yourself, then ask independent critics who didn't make it, and fix until they approve.

It decides what measurement can decide. Whether a picture is the right picture, whether the words are the right words, and whether a flow makes sense still need a person or a judge. Line length is checked only against a measure you declare. Jank is measured in headless Chromium at one size and theme; [Ouro Feel](https://github.com/ourostack/ouro-ui/blob/main/feel/README.md) measures a component in the engine an app ships in.

[^floor]: https://github.com/ourostack/ouro-ui-core/blob/3410bcdc81d46ffb88a35d0b2d605bae3d68a575/docs/decisions/2026-11-19-evidence-from-people.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/3410bcdc81d46ffb88a35d0b2d605bae3d68a575/docs/decisions/2026-11-19-evidence-from-people.md)
[^check-run]: test:scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups verify:testExists(scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups)
[^guide-rules]: test:scripts/agent-plugin.test.mjs::ouro-check agent plugin > the screen check guide names every rule Ouro check reports verify:testExists(scripts/agent-plugin.test.mjs::ouro-check agent plugin > the screen check guide names every rule Ouro check reports)
[^latest]: https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases; test:scripts/agent-plugin.test.mjs::ouro-check agent plugin > fetches the files the release's registry.json lists for ouro-check, and names only options Ouro check has verify:urlOk(https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases) verify:testExists(scripts/agent-plugin.test.mjs::ouro-check agent plugin > fetches the files the release's registry.json lists for ouro-check, and names only options Ouro check has)
[^check-states]: test:scripts/check/check-pages.test.mts::Ouro check > checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing verify:testExists(scripts/check/check-pages.test.mts::Ouro check > checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing)
[^node]: package.json verify:equals(package.json#devEngines.runtime.version)=>=22.18
[^skill-narrow-text]: test:scripts/check/check-pages.test.mts::Ouro check > flags narrow text held under three quarters of its column at 1440, naming the cap, and passes it under a declared measure; test:test/check-in-page.test.ts::findSizeIssues: narrow-text > flags prose a max-width holds under three quarters of a column at least 900px wide, naming the cap and the rule that set it verify:testExists(scripts/check/check-pages.test.mts::Ouro check > flags narrow text held under three quarters of its column at 1440, naming the cap, and passes it under a declared measure) verify:testExists(test/check-in-page.test.ts::findSizeIssues: narrow-text > flags prose a max-width holds under three quarters of a column at least 900px wide, naming the cap and the rule that set it)
[^skill-inset-frame]: test:test/check-design-in-page.test.ts::findDesignIssues: nested-frame > finds a lighter framed card inside a clipping frame even when it is inset well beyond the hug gap verify:testExists(test/check-design-in-page.test.ts::findDesignIssues: nested-frame > finds a lighter framed card inside a clipping frame even when it is inset well beyond the hug gap)
[^check-exit]: test:scripts/check/check-command.test.mts::Ouro check's command > exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings verify:testExists(scripts/check/check-command.test.mts::Ouro check's command > exits as every Ouro tool does: the Ouro AX kit's 0 ok, 1 error and 2 usage, then 3 for findings)
[^report]: registry/ouro/check/run.ts; test:scripts/check/check-pages.test.mts::Ouro check > names an axe finding the same at every size, whatever the other rules marked on the page verify:fileLine(registry/ouro/check/run.ts, /^  element: string;$/) verify:fileLine(registry/ouro/check/run.ts, /^  gated: boolean;$/) verify:fileLine(registry/ouro/check/run.ts, /^  closeUp\?: string;$/) verify:testExists(scripts/check/check-pages.test.mts::Ouro check > names an axe finding the same at every size, whatever the other rules marked on the page)
[^skill-panels]: test:test/check-panel-in-page.test.ts::findPanelIssues: empty-panel > finds a wide panel with its links in one narrow column, with the share it fills verify:testExists(test/check-panel-in-page.test.ts::findPanelIssues: empty-panel > finds a wide panel with its links in one narrow column, with the share it fills)
[^skill-popup-first-frame]: test:test/check-popup-in-page.test.ts::popup-first-frame > finds a popup drawn inside a layer far down the page and then moved to where it settles verify:testExists(test/check-popup-in-page.test.ts::popup-first-frame > finds a popup drawn inside a layer far down the page and then moved to where it settles)
