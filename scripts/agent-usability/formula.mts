/**
 * The agent-usability score, defined once. score.mts, table.mts and the README use it.
 *
 * A screen scores out of 100:
 *
 * | Part      | Points | Earned when                                                                  |
 * | --------- | -----: | ---------------------------------------------------------------------------- |
 * | typecheck |     20 | `tsc -b` passes over the whole app.                                          |
 * | lint      |     10 | oxlint, with a stock Vite app's config, reports nothing in the agent's files. |
 * | axe       |     20 | 5 per configuration (390px and 1280px, light and dark) whose every state     |
 * |           |        | rendered and had no axe violation.                                           |
 * | behavior  |     50 | Split evenly over the screen's behavior checks; each passing check earns its  |
 * |           |        | share.                                                                       |
 *
 * A build failure or a changed src/api/ file (the backend stand-in) costs the axe and behavior
 * points too, because the screen can't be judged; the reason is in the score's JSON.
 * Points are rounded to two decimals only for display; `score` is their exact sum.
 */
export const weights = { typecheck: 20, lint: 10, axe: 20, behavior: 50 } as const;

/** Bump when the formula changes, so tables never mix scores from two formulas. */
export const formulaVersion = 1;

export type Part = keyof typeof weights;

export interface Outcome {
  typecheck: boolean;
  lint: boolean;
  /** One entry per axe configuration: true when it rendered and was clean. */
  axe: boolean[];
  /** One entry per behavior check. */
  behavior: boolean[];
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
  const parts = {
    typecheck: outcome.typecheck ? weights.typecheck : 0,
    lint: outcome.lint ? weights.lint : 0,
    axe: share(weights.axe, outcome.axe),
    behavior: share(weights.behavior, outcome.behavior),
  };
  const max = weights.typecheck + weights.lint + weights.axe + weights.behavior;
  return { ...parts, score: parts.typecheck + parts.lint + parts.axe + parts.behavior, max };
}

/** A score for display: whole numbers stay whole, others get at most two decimals. */
export function formatPoints(value: number): string {
  return String(Math.round(value * 100) / 100);
}
