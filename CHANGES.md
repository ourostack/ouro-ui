# Changes in this release

- New: Message gained a `statusMark` prop that seats a small mark (such as "Seen" or a delivered checkmark) inside the user's own bubble, against its bottom end corner, in room the bubble reserves for it rather than a row of its own; it draws only on `role="user"` with a bubble.
- Fixed: some true-negative tests used the shared poll default to prove something does not happen; they now use a short bound for that one call site, so proving it takes less time, and the matching stale headroom exemptions were dropped.
- New: SnapPiP can be hidden to a small Show button: pass `onCollapsedChange` and it carries a Hide button and answers Escape, so a person can clear a face it covers.
