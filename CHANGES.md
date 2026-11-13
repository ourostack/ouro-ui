# Changes in this release

- Changed: the axe kit's `axeExclude` docs and the README say a popup that holds focus, such as a Menu, has Base UI's focus guards, which plain axe reports as `aria-hidden-focus` in Chromium and as `aria-command-name` in WebKit on Apple platforms, and that a scan should leave them out.
- Changed: Chart draws its legend in a row below the plot, outside the chart's SVG, so the plot keeps the chart's whole height and a chart with a legend is one row taller.
- Fixed: a Combobox clear button shows its cross icon.
- Fixed: a centered Dialog whose body scrolls opens with focus on the body's first control, or on its close button if the body lacks a control, instead of on the scrolling body.
- Fixed: an Emoji's filmstrip stops in the same render that brings back its still image, so the still image is not drawn mid-step.
- New: `Hero`, a page's opening block: an eyebrow, a title, a short lede, buttons and an optional picture that is [never drawn larger than its file](registry/ouro/components/ouro/hero/hero.test.tsx "verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > never shows the picture wider than its intrinsic width)"). It rises in on mount and only fades with reduced motion. Use it instead of `PageHeader` when the page needs a picture and room to breathe.
- Fixed: pressing a Menubar or context-menu trigger stops a page scroll in flight, as Menu, Popover, Select and Combobox triggers do, so the menu stays open.
- Fixed: Pagination switches to its compact summary when its full list doesn't fit the space it has, not only below the viewport's sm breakpoint, so it stays inside a narrow column.
- Fixed: the testing kit's mouse `drag` prints its slow-drag trace only with `OURO_TOUCH_TRACE=1`, as information, so a slow drag that succeeds stops failing a test run that fails on warnings.
- Changed: the touch kit's trace of a slow touch that succeeded prints only with `OURO_TOUCH_TRACE=1`, and as information rather than a warning, so a slow runner can't fail a warning-strict test run.
