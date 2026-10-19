import type { StoryViolation } from "../story-axe.ts";

/** A violation a fixture's own values cause, pinned to the exact nodes axe flags. */
export interface ThemeFinding {
  /** Each flagged node, exactly: phase, rule and selector. */
  violations: StoryViolation[];
  /** Why the theme, not Ouro, causes it, and who fixes it. */
  why: string;
}

/**
 * Violations a fixture's own values cause, by `<fixture> <scheme> <story id>`, which the app that
 * owns the theme fixes. A story listed here must flag exactly those nodes, no more and no fewer, so
 * a new failure in the same story still fails and the entry goes once the theme is fixed. Empty
 * while every fixture passes.
 */
export const themeFindings: Record<string, ThemeFinding> = {};

const key = ({ phase, rule, target }: StoryViolation) => `${phase} | ${rule} | ${target}`;

/**
 * What a story's scan has beyond its finding (`unexpected`) and what the finding lists that the
 * scan no longer flags (`missing`). With no finding, every violation is unexpected.
 */
export function compareFinding(found: StoryViolation[], finding: ThemeFinding | undefined): { unexpected: string[]; missing: string[] } {
  const pinned = (finding?.violations ?? []).map(key);
  const seen = found.map(key);
  return {
    unexpected: seen.filter((entry) => !pinned.includes(entry)),
    missing: pinned.filter((entry) => !seen.includes(entry)),
  };
}
