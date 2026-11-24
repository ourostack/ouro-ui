# Changes in this release

- Changed: Cover fills with one solid colour from `--ouro-cover-from` and stops reading `--ouro-cover-to`, Switch's track is one tint, and a folded ShowMore ends on a hard edge instead of a fade.
- New: Ouro check's `squircle-missing` rule, which runs when you pass `--engine wkwebview` (WebKit with `corner-shape` hidden, as in an app's WKWebView; `--engine webkit` runs Playwright's WebKit as it is), fails a drawn surface rounded under half its size by a plain circular radius that is neither clipped to a squircle (`data-ouro-squircle`) nor drawn by the polyfill (`registerSquirclePolyfill()`); Chromium draws `corner-shape` itself, so the rule has nothing to find there.
