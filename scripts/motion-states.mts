/**
 * The attributes that name a state in a component.json `motion` map (`data-checked`, or
 * `data-swiping=left` for one value). It is a closed list: every other `data-*` attribute an Ouro
 * component writes (`data-ouro`, `data-ouro-control`, `data-ouro-part`, `data-side`) is metadata
 * and never a state. Plain data, so scripts/components.mts reads it in Node and test/motion.ts
 * re-exports it for the browser.
 */
export const STATE_ATTRIBUTES: readonly string[] = [
  "data-checked",
  "data-unchecked",
  "data-indeterminate",
  "data-disabled",
  "data-readonly",
  "data-invalid",
  "data-open",
  "data-closed",
  "data-pressed",
  "data-selected",
  "data-highlighted",
  "data-expanded",
  "data-swiping",
  "data-dragging",
  "data-starting-style",
  "data-ending-style",
];

/** The kinds of state a `motion` map declares. */
export const MOTION_KINDS: readonly string[] = ["motion", "gesture-settle", "none"];
