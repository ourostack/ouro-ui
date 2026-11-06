// Ouro Feel's cases and their limits. A measure passes when its value is at or under its limit;
// measures with no limit are reported only. Limits only ever tighten.

/** One case: which component it proves, and the limit on each measure it gates. */
export interface FeelCaseSpec {
  name: string;
  component: string;
  /** What the case does, in a line. */
  does: string;
  limits: Record<string, number>;
}

export const cases: FeelCaseSpec[] = [
  {
    name: "history-prepend",
    component: "message-list",
    does: "A page of 200 older messages arrives above a reader who is up in a 200-message conversation.",
    // MessageList holds the reader's message in place in every frame while older history goes in
    // (its "puts pages of older messages in a few at a time" test): no frame may move it, blank the
    // list, or jump.
    limits: { anchorMovePx: 1, shifts: 0, jumps: 0, blankFrames: 0 },
  },
];
