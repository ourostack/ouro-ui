# Browser support[^range]

Ouro UI's documented floor is Chromium 158: the oldest Chromium build its CI, its static checks and its smoke test treat as the baseline, and the version nothing in this repository may silently slip below.[^range]

## The floor: Chromium 158[^range]

Chromium 149 to 157 drop every later rule in a stylesheet once they reach an ordinary property whose `shape()` value has a segment that is only a `var()` reference; Chromium 158 fixed it.[^range] That range is what let [ourostack/ouro-ui#3491](https://github.com/ourostack/ouro-ui/issues/3491) through: `squircleCorners()`'s appended corner-shape rule has exactly that shape, so on an affected Chromium every rule after it, anywhere later in the built stylesheet, silently stopped applying.[^pr]

Three checks hold the floor at 158, so a regression in any one of them is still caught by the others:[^range]

- A static check finds every `shape()` segment that is only a `var()` reference in an ordinary property, across the built `ouro-base` stylesheet and the squircle-corners plugin's own test fixtures, and fails if one appears outside a custom property.[^static]
- A live-browser test reads CI's actually-installed Chromium (from the `playwright` devDependency) and fails once it drops to or below 157, so a future Playwright downgrade that reintroduces the regression range is caught rather than assumed away.[^live]
- A report-only smoke job builds the real `ouro-base` CSS, including `squircleCorners()`'s output, and loads it in a separately pinned, independent copy of Chromium 158 — the oldest version this page promises still works — to prove a rule positioned after that output still applies even when CI's main Chromium is newer.[^smoke]

## Why 158[^range]

This repository is a private registry with no app of its own[^private]; it is consumed by Electron and WebView2 apps, which update their embedded Chromium largely on their own schedule rather than a person's. Both ecosystems favor shipping ahead of 158, not behind it, which is why that version is a floor and not a target.[^range]

- Electron keeps only its three most recent stable major versions current at a time, ships a new major roughly every eight weeks, and tracks even-numbered Chromium majors; its oldest current line gets security fixes only, so an Electron app that still ships a Chromium at or below 157 is already past Electron's own currency window.[^electron]
- The default ("Evergreen") WebView2 Runtime a Windows app embeds "provides the same web platform capabilities and update release cadence as the Stable channel of Microsoft Edge," so a WebView2 app on the default distribution tracks Edge Stable's Chromium rather than a version frozen at build time.[^webview2]

An Electron or WebView2 app that opts out of this (a fixed, unpatched Electron build; WebView2's non-default "Fixed Version" distribution) sits outside both platforms' own currency expectations, not just Ouro UI's floor; this page does not try to cover that case.

## Raising or lowering the floor

Raise this page, `scripts/chromium-range.test.mjs`'s `>= 158` assertion and the smoke job's pinned Chromium together, in one pull request, when a new regression or a newer Electron/WebView2 baseline justifies it. Never lower any of the three without first confirming the regression range they guard against no longer applies.

[^range]: scripts/chromium-range.test.mjs verify:fileLine(scripts/chromium-range.test.mjs, /assert\.ok\(major >= 158/)
[^private]: package.json verify:fileLine(package.json, /"private": true/)
[^pr]: https://github.com/ourostack/ouro-ui/pull/3494 verify:urlOk(https://github.com/ourostack/ouro-ui/pull/3494)
[^static]: scripts/source-rules.test.mjs verify:testExists(scripts/source-rules.test.mjs::bareVarShapeDecls finds an ordinary property's shape() segment that is only a var(), and clears it once the shape() moves into a custom property)
[^live]: scripts/chromium-range.test.mjs verify:testExists(scripts/chromium-range.test.mjs::CI's installed Chromium (from Playwright, pinned in package.json) is past the 149 to 157 shape()/var() regression range)
[^smoke]: scripts/chromium-floor-smoke.mjs verify:fileLine(scripts/chromium-floor-smoke.mjs, /assert\.equal\(\s*major,\s*158,/) verify:fileLine(scripts/chromium-floor-smoke.mjs, /the marker rule, positioned after squircleCorners/)
[^electron]: https://www.electronjs.org/docs/latest/tutorial/electron-timelines verify:urlOk(https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
[^webview2]: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution verify:urlOk(https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
