/** One model review run's record, the fields the page reads: scripts/model-reviews/results/<run>/run.json. */
interface ReviewRun {
  asOf: string;
  summary: { totalReviews: number; subjectPicks: number };
  candidates: unknown[];
}

// Only the small fields of each run, so the reviews' text never reaches the page's JavaScript.
const asOf = import.meta.glob<string>("../../../scripts/model-reviews/results/*/run.json", { eager: true, import: "asOf" });
const summaries = import.meta.glob<ReviewRun["summary"]>("../../../scripts/model-reviews/results/*/run.json", { eager: true, import: "summary" });
const candidates = import.meta.glob<unknown[]>("../../../scripts/model-reviews/results/*/run.json", { eager: true, import: "candidates" });

/**
 * The latest review: the first run of the newest series (`<series>--run-1`), which every model in the panel answered;
 * a series' later runs only retry a model that didn't.
 */
export function latestReview(runs: Record<string, ReviewRun> = Object.fromEntries(Object.keys(asOf).map((path) => [path, { asOf: asOf[path]!, summary: summaries[path]!, candidates: candidates[path]! }]))): {
  picked: number;
  models: number;
  toolkits: number;
  date: string;
  path: string;
} {
  const path = Object.keys(runs)
    .filter((key) => /--run-1\/run\.json$/.test(key))
    .sort()
    .at(-1);
  if (!path) throw new Error("[ouro-site] /proof/ can't find a first run in scripts/model-reviews/results to say what the models picked.");
  const run = runs[path]!;
  return { picked: run.summary.subjectPicks, models: run.summary.totalReviews, toolkits: run.candidates.length, date: run.asOf.slice(0, 10), path };
}

export const REVIEWS = latestReview();
