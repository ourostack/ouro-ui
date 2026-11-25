# Changes in this release

- Fixed: TimeGrid's glass day header keeps its text legible over the events scrolling beneath it: a stronger tint and blur, and a darker label for the untimed row.
- New: `TimeGrid` takes the keyboard to empty slots when `onSlotSelect` is set: one Tab stop, arrows move by step, day and hour, Home and End go to the day edges, and Enter or Space selects the slot.
