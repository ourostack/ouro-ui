// Renders the site's model reviews page (docs/guides/model-reviews.md, served at /docs/model-reviews/) from the
// published runs in scripts/model-reviews/results/. The headline, every count and every quote come from the runs'
// run.json files; nothing on the page is written by hand. pnpm claims:check renders it again and fails when the
// committed page differs.
//
//   node scripts/model-reviews/page.mjs docs/guides/model-reviews.md
//
// A results folder is named `<series>--<run>`, for example `2026-11-13-baseline--run-1`. A series is one review of the
// panel. It may hold more than one run only because a model produced no verdict and was run again with the same input
// (METHODOLOGY.md, "Never curate"), so a model with two verdicts in one series is refused: that would be a second vote.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEW_MODELS, SUBJECT, evaluationSection } from "./model-reviews.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/ourostack/ouro-ui";
export const RESULTS_DIR = path.join(here, "results");

/** Every published run, oldest series first: `results/<series>--<run>/run.json`. */
export function publishedRuns(dir = RESULTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((folder) => ({ folder, file: path.join(dir, folder, "run.json") }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ folder, file }) => ({ folder, ...JSON.parse(fs.readFileSync(file, "utf8")) }));
}

/** The runs grouped into series, oldest first. Each series has one row per model it tried: a review, or why there is none. */
export function seriesOf(runs) {
  const groups = new Map();
  for (const run of runs) {
    const split = run.folder.indexOf("--");
    if (split <= 0) throw new Error(`${run.folder}: a results folder is named <series>--<run>`);
    if (run.status === "preflight" || run.status === "running") throw new Error(`${run.folder} is a ${run.status} record, not a finished run. Remove it from results/.`);
    const id = run.folder.slice(0, split);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(run);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, members]) => {
      members.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const rows = new Map();
      for (const run of members) {
        for (const review of run.reviews ?? []) {
          const row = rows.get(review.provider);
          if (row?.review) throw new Error(`Series ${id} has two verdicts from ${review.provider} (${row.run.folder} and ${run.folder}). A model is asked once per series; run it again only when it gave no verdict.`);
          rows.set(review.provider, { provider: review.provider, displayName: review.displayName, review, run });
        }
        for (const failure of run.failures ?? []) {
          if (rows.get(failure.provider)?.review) continue;
          const displayName = run.reviewers?.find((r) => r.provider === failure.provider)?.displayName ?? rows.get(failure.provider)?.displayName ?? REVIEW_MODELS.find((r) => r.provider === failure.provider)?.displayName ?? failure.provider;
          const attempts = (rows.get(failure.provider)?.attempts ?? 0) + 1;
          rows.set(failure.provider, { provider: failure.provider, displayName, error: failure.error, attempts, run });
        }
      }
      return { id, runs: members, rows: [...rows.values()] };
    });
}

/** The counts the headline is made of, for one series. */
export function tally(series, subject = SUBJECT) {
  const reviews = series.rows.filter((row) => row.review).map((row) => row.review);
  const picks = {};
  for (const review of reviews) picks[review.verdict] = (picks[review.verdict] ?? 0) + 1;
  const ranked = Object.entries(picks).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const subjectPicks = picks[subject] ?? 0;
  const top = ranked[0]?.[1] ?? 0;
  return {
    tried: series.rows.length,
    completed: reviews.length,
    picks: ranked,
    subjectPicks,
    // The bar for saying models choose Ouro UI: more than half the models that gave a verdict chose it.
    barMet: reviews.length > 0 && subjectPicks * 2 > reviews.length && subjectPicks === top,
    unanimous: reviews.length > 0 && subjectPicks === reviews.length && reviews.length === series.rows.length,
  };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const date = (series) => series.runs[0].startedAt.slice(0, 10);
const blob = (run, file) => `${REPO}/blob/main/scripts/model-reviews/results/${run.folder}/${file}`;
const oneLine = (text) => text.replace(/\s*\n\s*/g, " ").trim();
const cell = (text) => oneLine(text).replace(/\|/g, "\\|");

/** The headline sentence for a series, from its tally alone. */
export function headline(series, subject = SUBJECT) {
  const t = tally(series, subject);
  const others = t.picks.filter(([name]) => name !== subject).map(([name, n]) => `${n} chose ${name}`);
  const rest = others.length ? `; ${others.join(", ")}` : "";
  if (t.unanimous) return `All ${t.completed} models asked chose ${subject}.`;
  if (t.barMet) return `${t.subjectPicks} of ${t.completed} models chose ${subject}${rest}.`;
  return `${subject} is not yet the models' choice: ${t.subjectPicks} of ${t.completed} models chose it${rest}.`;
}

/** The page, from `runs` (publishedRuns()). */
export function renderPage(runs, subject = SUBJECT) {
  const all = seriesOf(runs);
  if (!all.length) throw new Error("No published run in scripts/model-reviews/results/. Run the reviews and copy the run there first.");
  const latest = all.at(-1);
  const previous = all.at(-2);
  const t = tally(latest, subject);
  const failed = latest.rows.filter((row) => !row.review);
  const out = [];
  out.push("# Which toolkit models choose");
  out.push("");
  out.push(headline(latest, subject));
  out.push("");
  out.push(
    `On ${date(latest)}, ${plural(t.tried, "frontier model")} were each asked, on their own and in neutral words, which design system or interface toolkit they would use to build interfaces that people and agents both use, across web and native. Each got the same ${latest.runs[0].candidates.length} candidates, by name and link only, in its own random order, and researched them with the same search and fetch tools before answering. ${plural(t.completed, "model")} gave a verdict${failed.length ? `; ${failed.map((row) => row.displayName).join(", ")} gave none` : ""}.`,
  );
  out.push("");
  out.push(`The page says models choose ${subject} only when more than half of the models that answered chose it. Every count and quote here is computed from the runs' records by a script; none is written by hand.`);
  if (previous) {
    const before = new Map(previous.rows.filter((row) => row.review).map((row) => [row.provider, row.review.verdict]));
    const shared = latest.rows.filter((row) => row.review && before.has(row.provider));
    const was = shared.filter((row) => before.get(row.provider) === subject).length;
    const now = shared.filter((row) => row.review.verdict === subject).length;
    const moved = shared.filter((row) => before.get(row.provider) !== row.review.verdict);
    out.push("");
    out.push(
      `Against the ${date(previous)} run, counting only the ${plural(shared.length, "model")} that answered both times: ${was} chose ${subject} then and ${now} now.${moved.length ? ` Changed: ${moved.map((row) => `${row.displayName} (${before.get(row.provider)} to ${row.review.verdict})`).join(", ")}.` : " No model changed its pick."}`,
    );
  }
  out.push("");
  out.push("## Every model's pick");
  out.push("");
  out.push(`| Model | Pick | ${subject}'s place in its list | Rounds | Transcript |`);
  out.push("| --- | --- | --- | --- | --- |");
  for (const row of latest.rows) {
    if (row.review) {
      const place = row.review.candidateOrder.indexOf(subject) + 1;
      out.push(`| ${row.displayName} | ${row.review.verdict} | ${place} of ${row.review.candidateOrder.length} | ${row.review.rounds} | [${row.provider}](${blob(row.run, `transcripts/${row.provider}.json`)}) |`);
    } else {
      out.push(`| ${row.displayName} | no verdict (${cell(row.error)}; ${plural(row.attempts, "attempt")}) | n/a | n/a | [${row.provider}](${blob(row.run, `transcripts/${row.provider}.json`)}) |`);
    }
  }
  out.push("");
  out.push(`## What each model said about ${subject}`);
  out.push("");
  out.push(`Each model's evaluation of ${subject}, verbatim from its verdict, with line breaks joined. A model's reasons are its own and may be wrong about a fact; its transcript shows what it read.`);
  for (const row of latest.rows.filter((r) => r.review)) {
    out.push("");
    out.push(`### ${row.displayName}, who chose ${row.review.verdict}`);
    out.push("");
    out.push(`${subject}${evaluationSection(row.review.evaluations, subject).replace(/\s*\n\s*/g, " ").trimEnd()}`);
    if (row.review.verdict !== subject) {
      out.push("");
      out.push(`Why it chose ${row.review.verdict}: "${oneLine(row.review.pullQuote)}"`);
    }
  }
  out.push("");
  out.push("## How it was run");
  out.push("");
  const pinned = latest.runs[0].candidates.find((c) => c.name === subject);
  out.push(`- Question, tools and rules: the [methodology](${REPO}/blob/main/scripts/model-reviews/METHODOLOGY.md) and the [script](${REPO}/blob/main/scripts/model-reviews/model-reviews.mjs). The prompt names each candidate and its link, and nothing else.`);
  out.push(`- Sources were pinned at each run's cutoff; ${subject} was read at [\`${pinned.sha.slice(0, 8)}\`](${REPO}/tree/${pinned.sha}).`);
  out.push(`- Runs in this review: ${latest.runs.map((run) => `[\`${run.folder}\`](${blob(run, "run.json")}) (cutoff ${run.asOf.slice(0, 16).replace("T", " ")} UTC)`).join(", ")}. A model that gave no verdict was run again with the same input; a verdict is never asked for twice.`);
  out.push(`- Inference: ${[...new Set(latest.runs.map((run) => run.runtime?.name).filter(Boolean))].join(", ")} for models in its catalog, and a model's own API for the rest (${[...new Set(latest.rows.filter((r) => r.review?.transport === "direct-api").map((r) => r.displayName))].join(", ") || "none"}).`);
  out.push(`- One verdict per model is a sample, not a rate. A result is about the models that ran, on that date.`);
  if (all.length > 1) out.push(`- Earlier reviews, still published: ${all.slice(0, -1).map((s) => `${date(s)} (${headline(s, subject)})`).join("; ")}`);
  out.push("");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/model-reviews/page.mjs <out.md>");
    process.exitCode = 2;
  } else {
    fs.writeFileSync(target, renderPage(publishedRuns()));
    console.log(`Wrote ${target}`);
  }
}
