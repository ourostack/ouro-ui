/**
 * The agent-usability score, defined once. score.mts and table.mts compute with it, and the
 * README and the prompt point here instead of repeating it.
 *
 * A screen scores out of 100:
 *
 * | Part      | Points | Earned when                                                                   |
 * | --------- | -----: | ----------------------------------------------------------------------------- |
 * | typecheck |     20 | `tsc -b`, with the app's own settings, reports no error that the app did not   |
 * |           |        | already have before the agent ran.                                            |
 * | lint      |     10 | oxlint, with the app's own config, reports no error (warnings don't count)     |
 * |           |        | that the app did not already have before the agent ran.                       |
 * | axe       |     20 | 5 for each of 390px light, 390px dark, 1280px light and 1280px dark in which   |
 * |           |        | every state the task names rendered and axe-core's WCAG 2 A and AA rules       |
 * |           |        | found no violation.                                                           |
 * | behavior  |     50 | Split evenly over the screen's behavior checks; each passing check earns its   |
 * |           |        | share.                                                                        |
 *
 * Two rules sit on top:
 *
 * 1. A screen that does nothing scores 0. Every point is earned only when at least one behavior
 *    check that exercises the task passes. A check that a near-empty page passes, such as "the
 *    page doesn't scroll sideways at 390px" or the app shell's skip link (marked `gate: false`),
 *    doesn't count toward that, and earns its own share only once another check passes. So a
 *    page that does only the minimum, such as one heading, one heading and a skip link, or an
 *    untouched app, scores 0 however clean its code is.
 * 2. No behavior check counts when the app does not build, or when the agent changed the
 *    backend stand-in (src/api/). By rule 1 such a run scores 0.
 *
 * Every run is scored with the arm's original configuration files (package.json, the lockfile,
 * the tsconfig files, the lint, Vite and components configs): the scorer puts them back first.
 * A config edit neither helps nor costs; a package the agent added breaks the build only if the
 * code imports it.
 *
 * "Already had" is the arm's baseline: what the type check and the linter found when
 * arms/create.sh made the app. A finding matches a baseline entry by file, rule and message,
 * not by line.
 *
 * Screenshots earn nothing. The scorer saves them as evidence for people.
 *
 * Each arm builds each screen three times; a cell of the results table shows the three scores
 * and their median. Points are rounded to two decimals only for display.
 */
export const weights = { typecheck: 20, lint: 10, axe: 20, behavior: 50 } as const;

/** Bump when the formula changes, so tables never mix scores from two formulas. */
export const formulaVersion = 4;

/** How many times each arm builds each screen. */
export const runsPerCell = 3;

export type Part = keyof typeof weights;
export const parts = Object.keys(weights) as Part[];

export interface Outcome {
  typecheck: boolean;
  lint: boolean;
  /** One entry per axe configuration: true when it rendered and was clean. */
  axe: boolean[];
  /** One entry per behavior check: true when it passed and counts (rule 2). */
  behavior: boolean[];
  /** One entry per behavior check: false for a check that a near-empty page passes (rule 1). */
  gates: boolean[];
}

export interface Points {
  typecheck: number;
  lint: number;
  axe: number;
  behavior: number;
  score: number;
  max: number;
}

const share = (weight: number, passed: boolean[]): number =>
  passed.length === 0 ? 0 : (weight * passed.filter(Boolean).length) / passed.length;

export function points(outcome: Outcome): Points {
  const works = outcome.behavior.some((passed, index) => passed && outcome.gates[index] !== false);
  const earned = {
    typecheck: works && outcome.typecheck ? weights.typecheck : 0,
    lint: works && outcome.lint ? weights.lint : 0,
    axe: works ? share(weights.axe, outcome.axe) : 0,
    behavior: works ? share(weights.behavior, outcome.behavior) : 0,
  };
  const max = weights.typecheck + weights.lint + weights.axe + weights.behavior;
  return { ...earned, score: earned.typecheck + earned.lint + earned.axe + earned.behavior, max };
}

/** The middle value; of an even count, the mean of the two middle ones. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** A score for display: whole numbers stay whole, others get at most two decimals. */
export function formatPoints(value: number): string {
  return String(Math.round(value * 100) / 100);
}
