# Status dashboards

A status dashboard tells a person where some work stands: what is done, what failed, what is running, and what nobody has started. These are principles for building one that people trust and enjoy, drawn from published design systems, standards and usability research. They apply to a page built with Ouro HX components and to one written in plain HTML and CSS.

## Keep the result and the work apart

Give each item two fields: its result (passed, failed, not yet known) and its work (queued, running, waiting, finished). GitHub's checks API keeps them apart in the same way: a check run's `status` says where the run is, and its `conclusion` is set only when the run completes.[^checks]

- Keep a known failure visible as a failure while a new run is in progress.
- Show work as running only when a real run exists, with a link to it or the time it started. If nothing is scheduled, say so in words instead of showing progress.
- Write "not yet checked" for a result nobody has measured, and keep it distinct from a failure.

## Make what needs action loud and what is done quiet

The GOV.UK Design System shows a completed task as plain text with no background colour, so the eye goes to the tasks that need action; its research found that uppercase statuses were harder to read, and that some users tried to click statuses that looked like buttons.[^govuk] Carbon advises against a status indicator where no action is needed, and warns that more than five or six kinds of indicator can overwhelm.[^carbon]

- Use sentence case for status words.
- Keep the set of statuses small, and add one only when people need the distinction.
- Reserve the destructive color for failures and errors.
- Give a group the color of its most urgent member, as Carbon does.[^carbon]

## Say it in more than color

WCAG 2.2 asks that color is not the only way information is conveyed, and that a meaningful graphic has a contrast of at least 3:1 against what is next to it.[^wcag-color]

- Pair each status color with a word and a shape or symbol, as Carbon's icon indicator pairs an icon, a shape, a color and a label.[^carbon]
- Use the theme's `--success`, `--warning` and `--destructive` pairs, with their `-foreground` colors for text on them.
- Announce a change that happens while the page is open with a status message that does not move focus, as WCAG's status messages criterion describes.[^wcag-status]

## Use a table to compare

Nielsen Norman Group found that a table makes comparison easy, because adjacent values can be seen at once, while cards make the reader reorient on each one.[^tables]

- Put a readable name in the first column, not an ID.
- Order columns by importance.
- Freeze the header row, and the first column when the table is wider than the screen.[^tables]
- Keep the row on a phone too: shorten it before you turn it into a card.
- Show when a filter is on, and how to clear it.

## Show the answer first and the detail on request

Progressive disclosure shows the few most important things first and the rest when the reader asks.[^disclosure]

- Answer the page's main question on the first screen: how much is done, and what needs action.
- Keep the evidence behind each status one click away, in a disclosure that opens in place.
- Label a disclosure with words, not only a chevron.

## Say how fresh it is

A page that is generated, not live, should say so.

- Show when the page was built, and how recent its data is, near the top.
- Show where each result comes from, with a link to its source.
- Don't call a generated page live, and don't animate it as if it were.

## Add delight on top of a working page

Nielsen Norman Group's theory of delight holds that deep delight comes only from a product that is functional, reliable and usable, and that decoration alone produces only surface delight.[^delight]

- Make the page correct and readable first.
- Animate in response to what the reader does, or to show that a state changed, and keep it short: the `--ouro-duration-*` tokens run from 150ms to 500ms.[^durations]
- Give each animation a still version under `prefers-reduced-motion`, as WCAG's animation from interactions criterion asks.[^wcag-motion]
- Let an illustration show state, such as a figure that changes with the page's overall result, rather than decorate.
- Keep the focused element visible under sticky headers, with `scroll-padding`, as WCAG's focus not obscured criterion asks.[^wcag-focus]

## Make it work without script and on paper

- Render every status in the HTML, so the page reads without JavaScript.
- Open every disclosure in print, and print the build time on the page.

[^checks]: https://docs.github.com/en/rest/checks/runs verify:urlOk(https://docs.github.com/en/rest/checks/runs)

[^govuk]: https://design-system.service.gov.uk/components/task-list/ verify:urlOk(https://design-system.service.gov.uk/components/task-list/)

[^carbon]: https://carbondesignsystem.com/patterns/status-indicator-pattern/ verify:urlOk(https://carbondesignsystem.com/patterns/status-indicator-pattern/)

[^wcag-color]: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html; https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html verify:urlOk(https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) verify:urlOk(https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

[^wcag-status]: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html verify:urlOk(https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

[^tables]: https://www.nngroup.com/articles/data-tables/ verify:urlOk(https://www.nngroup.com/articles/data-tables/)

[^disclosure]: https://www.nngroup.com/articles/progressive-disclosure/ verify:urlOk(https://www.nngroup.com/articles/progressive-disclosure/)

[^delight]: https://www.nngroup.com/articles/theory-user-delight/ verify:urlOk(https://www.nngroup.com/articles/theory-user-delight/)

[^durations]: registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-duration-fast: 150ms/) verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-duration-sheet: 500ms/)

[^wcag-motion]: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html verify:urlOk(https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

[^wcag-focus]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html verify:urlOk(https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
