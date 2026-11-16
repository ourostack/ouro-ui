# Changes in this release

- New: Message's pending marks a sent message the app has not confirmed: after a second a quiet clock fades in beside it, and screen readers hear "Sending" once.
- ouro-base: `ouro-nav-link` (links in a nav, the current one marked), `ouro-toggle` (a pressed button), `ouro-segmented` with `ouro-segment` (labels around radios or checkboxes drawn as SegmentedControl) and `ouro-option` (a selected option) give plain markup the states of Link, Toggle, SegmentedControl and Command, and the Ouro source rule counts them as Ouro's. Add `ouro-base` again to get them; the plain stylesheet `site/public/css/ouro-base.css` has them too.
