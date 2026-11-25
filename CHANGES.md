# Changes in this release

- Fixed: EmojiText's enlarged emoji keep a clear gap apart, instead of sitting under the minimum gap on their source text's own space (#3286).
- New: TimeGrid folds overlapping events that a narrow day (a phone, a work week, large text) is too small to read into a `+N` chip that opens their list; `moreLabel` sets its words.
- Changed: a stack button of overlapping background events now carries an `aria-label` with its time range, so it keeps a name when its text is squeezed out.
