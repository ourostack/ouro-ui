# Changes in this release

- Docs: the calendar demo and the site header fit a narrow window when text is doubled, so the page no longer scrolls sideways.
- Fixed: on a phone, the calendar demo's Undo toast moves to the top while Go to date is open, so it no longer covers the sheet's last rows.
- Fixed: the docs sidebar stays narrow on a small window, so large type leaves the page a usable column.
- TimeGrid: the corner above the hour labels is opaque, so labels no longer show through the glass header as they scroll under it.
- Changed: under forced colours, an event's per-calendar cue tells calendars apart with width and a dashed start edge drawn from classes the grid already uses, so an app's stylesheet carries fewer new rules.
- Fixed: TimeGrid draws the keyboard's slot as an empty dashed outline, so a focused slot after a delete no longer looks like a new event.
- Fixed: TimeGrid draws a drag's end label only from the drag itself, not from the slot the pointer hovers.
- TimeGrid: under forced colours a calendar's start bar draws in a width of its own, so calendars stay apart.
- TimeGridNav: Today draws the quiet outline of a secondary button, so it no longer shows a tinted border beside the arrows.
- Fixed: a toast's action button, such as Undo, is a full touch target on a coarse pointer.
