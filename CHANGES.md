# Changes in this release

- Fixed: a pull request whose own CSS or JavaScript size is over its ceiling now fails the size gate, whether it is the first to tip the ceiling or its base was already over (scripts/size-gate.mjs); before, both cases were report-only (a `::warning` annotation), which let a pull request land on a base already over a ceiling without ever failing for it.
- Changed: TimeGrid opens half an hour before the earlier of the working day's start and the first event shown, and no longer scrolls to now; the now line still shows when it falls in that window.
