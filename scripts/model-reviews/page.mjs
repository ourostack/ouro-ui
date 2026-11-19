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
import { BUDGET_REACHED, REVIEW_MODELS, SUBJECT, evaluationSection } from "./model-reviews.mjs";

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
    .map(({ folder, file }) => {
      const run = { folder, ...JSON.parse(fs.readFileSync(file, "utf8")) };
      // Each review's research calls, by kind, from its transcript, so the page can say how much each review searched.
      for (const review of run.reviews ?? []) {
        const transcript = path.join(dir, folder, "transcripts", `${review.provider}.json`);
        if (!fs.existsSync(transcript)) continue;
        // A call the research budget refused read nothing, so it isn't counted.
        const actions = (JSON.parse(fs.readFileSync(transcript, "utf8")).rounds ?? []).flatMap((round) => round.actions ?? []).filter((a) => a.result !== BUDGET_REACHED);
        review.research = { searches: actions.filter((a) => a.type === "search").length, fetches: actions.filter((a) => a.type === "fetch").length };
      }
      return run;
    });
}

/** The runs grouped into series, oldest first. Each series has one row per model it tried: a review, or why there is none. */
export function seriesOf(runs) {
  const groups = new Map();
  for (const run of runs) {
    if (run.series !== undefined) throw new Error(`${run.folder} is a run of the ${run.series} series, whose counts never mix with the model reviews'. Move it to its own series' results.`);
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
          rows.set(review.provider, { provider: review.provider, displayName: review.displayName, review, run, earlier: row?.earlier ?? [] });
        }
        for (const failure of run.failures ?? []) {
          if (rows.get(failure.provider)?.review) continue;
          const displayName = run.reviewers?.find((r) => r.provider === failure.provider)?.displayName ?? rows.get(failure.provider)?.displayName ?? REVIEW_MODELS.find((r) => r.provider === failure.provider)?.displayName ?? failure.provider;
          const earlier = [...(rows.get(failure.provider)?.earlier ?? []), run];
          rows.set(failure.provider, { provider: failure.provider, displayName, error: failure.error, attempts: earlier.length, run, earlier });
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

/** Replays of a review's searches through another backend (search-replay.json), matched to a series by its runs' ids. */
export function searchReplays(file = path.join(here, "search-replay.json")) {
  return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, "utf8"))] : [];
}

/** A series' searches and fetches, from its reviews' transcripts (publishedRuns reads them), or null when none were read. */
export function researchCalls(series) {
  const counted = series.rows.map((row) => row.review?.research).filter(Boolean);
  if (!counted.length) return null;
  return { searches: counted.reduce((sum, r) => sum + r.searches, 0), fetches: counted.reduce((sum, r) => sum + r.fetches, 0) };
}

/** The search backend a series' runs used; a run that records none is from before 2026-11-19, which used Perplexity. */
export function searchOf(series) {
  const backends = [...new Set(series.runs.map((run) => run.runtime?.search?.backend ?? "perplexity"))];
  if (backends.length > 1) throw new Error(`Series ${series.id} mixes search backends (${backends.join(", ")}): a series uses one`);
  return backends[0];
}

const SEARCH_NAMES = { copilot: "GitHub Copilot's web search, returning each result's title, address and snippets", perplexity: "Perplexity's `sonar`, which answers with a written summary" };

/**
 * What changed between two reviews besides the models' minds: Ouro UI's own source, the panel and the search backend.
 * A change in picks can come from any of them, so the page names every one that changed, with what separates them.
 */
export function whatChanged(previous, latest, subject = SUBJECT, replays = []) {
  const causes = [];
  const sha = (series) => series.runs[0].candidates.find((c) => c.name === subject)?.sha;
  const [then, now] = [sha(previous), sha(latest)];
  if (then && now && then !== now) causes.push(`**${subject} itself:** it was read at [\`${then.slice(0, 8)}\`](${REPO}/tree/${then}) then and [\`${now.slice(0, 8)}\`](${REPO}/tree/${now}) now ([what changed](${REPO}/compare/${then}...${now})).`);
  const shas = (series) => new Map(series.runs[0].candidates.filter((c) => c.sha && c.name !== subject).map((c) => [c.name, c.sha]));
  const [othersThen, othersNow] = [shas(previous), shas(latest)];
  const moved = [...othersNow].filter(([name, sha]) => othersThen.has(name) && othersThen.get(name) !== sha).map(([name]) => name);
  if (moved.length) causes.push(`**The other candidates:** ${moved.length} other ${moved.length === 1 ? "candidate was" : "candidates were"} read at newer commits too: ${moved.join(", ")}.`);
  const config = (series) => series.rows.find((row) => row.review?.configuration)?.review.configuration ?? {};
  const [budgetThen, budgetNow] = [config(previous).researchBudget, config(latest).researchBudget];
  if (budgetThen !== budgetNow) causes.push(`**The research budget:** ${budgetThen ? `${budgetThen.toLocaleString("en-US")} characters` : "none"} then, ${budgetNow ? `${budgetNow.toLocaleString("en-US")} characters` : "none"} now. The prompt tells each model its budget, and a session that stays inside it can finish without compacting, so a model that compacted before may give a verdict now.`);
  const names = (series) => new Map(series.rows.map((row) => [row.provider, row.displayName]));
  const [was, is] = [names(previous), names(latest)];
  const joined = [...is].filter(([p]) => !was.has(p)).map(([, n]) => n);
  const left = [...was].filter(([p]) => !is.has(p)).map(([, n]) => n);
  if (joined.length || left.length) causes.push(`**The panel:** ${[joined.length ? `${joined.join(", ")} joined` : "", left.length ? `${left.join(", ")} left` : ""].filter(Boolean).join("; ")}. The comparison above counts only the models in both.`);
  const [searchThen, searchNow] = [searchOf(previous), searchOf(latest)];
  if (searchThen !== searchNow) {
    const calls = [researchCalls(previous), researchCalls(latest)];
    const share = calls.every(Boolean) ? ` Searches were ${calls[0].searches} of the ${calls[0].searches + calls[0].fetches} research calls then and ${calls[1].searches} of ${calls[1].searches + calls[1].fetches} now; the rest read pages directly.` : "";
    const ids = new Set(previous.runs.map((run) => run.runId));
    const replay = replays.find((r) => r.runIds?.some((id) => ids.has(id)));
    let replayed = "";
    if (replay) {
      // Only queries that came back with results can say whether Copilot surfaces Ouro UI's pages.
      const done = replay.queries.filter((q) => !q.copilotError && q.copilotResults > 0);
      const plain = done.filter((q) => !q.namesOuro);
      const named = done.filter((q) => q.namesOuro);
      const results = done.reduce((sum, q) => sum + q.copilotResults, 0);
      const missing = replay.queries.length - done.length;
      replayed = ` Replaying all ${replay.queries.length} of the ${date(previous)} review's searches, including those from attempts that gave no verdict, through ${searchNow === "copilot" ? "Copilot" : searchNow} on ${replay.replayedAt} ([the record](${REPO}/blob/main/scripts/model-reviews/search-replay.json), [the script](${REPO}/blob/main/scripts/model-reviews/search-replay.mjs)): ${done.length} came back with results, ${(results / Math.max(done.length, 1)).toFixed(1)} on average. Of the ${plain.length} that didn't name ${subject}, Copilot returned a page of ${subject}'s for ${plain.filter((q) => q.copilotOuroPages > 0).length}, and the earlier answers mentioned ${subject} in ${plain.filter((q) => q.perplexityMentionsOuro).length} (judged from the first 500 characters the transcripts keep); of the ${named.length} that named it, ${named.filter((q) => q.copilotOuroPages > 0).length} and ${named.filter((q) => q.perplexityMentionsOuro).length}.${missing ? ` ${missing} came back with no results or failed.` : ""}`;
    }
    causes.push(`**Search:** then ${SEARCH_NAMES[searchThen]}; now ${SEARCH_NAMES[searchNow]}.${share}${replayed}`);
  }
  const [from, to] = [date(previous), date(latest)];
  causes.push(`**The script:** [its changes between the two reviews](${REPO}/commits/main/scripts/model-reviews?since=${from}&until=${to}T23:59:59Z), such as how a refused verdict is explained to the model, aren't all in the records above.`);
  return [`Besides the models, at least these changed between the two reviews, so a change in picks can't be credited to ${subject} alone:`, "", ...causes.map((cause) => `- ${cause}`)];
}

/** The page, from `runs` (publishedRuns()). */
export function renderPage(runs, subject = SUBJECT, replays = searchReplays()) {
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
  // At a glance: each model's pick and its own one-line reason, in the table's order, before the method and the detail.
  for (const row of latest.rows) {
    out.push(
      row.review
        ? `- **${row.displayName}** chose ${row.review.verdict}: "${oneLine(row.review.pullQuote)}"`
        : `- **${row.displayName}** gave no verdict.`,
    );
  }
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
    out.push("");
    out.push(...whatChanged(previous, latest, subject, replays));
  }
  out.push("");
  out.push("## Every model's pick");
  out.push("");
  out.push(`| Model | Pick | ${subject}'s place in its list | Rounds | Transcript |`);
  out.push("| --- | --- | --- | --- | --- |");
  for (const row of latest.rows) {
    if (row.review) {
      const place = row.review.candidateOrder.indexOf(subject) + 1;
      const before = row.earlier.map((run, i) => `; attempt ${i + 1}, no verdict: [${run.folder}](${blob(run, `transcripts/${row.provider}.json`)})`).join("");
      out.push(`| ${row.displayName} | ${row.review.verdict}${row.earlier.length ? ` (attempt ${row.earlier.length + 1})` : ""} | ${place} of ${row.review.candidateOrder.length} | ${row.review.rounds} | [${row.provider}](${blob(row.run, `transcripts/${row.provider}.json`)})${before} |`);
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
  out.push(`- Runs in this review: ${latest.runs.map((run) => `[\`${run.folder}\`](${blob(run, "run.json")}) (cutoff ${run.asOf.slice(0, 16).replace("T", " ")} UTC)`).join(", ")}. A model that gave no verdict was run again with the same input, and the table links its earlier attempts; a verdict is never asked for twice.`);
  out.push(`- Inference: ${[...new Set(latest.runs.map((run) => run.runtime?.name).filter(Boolean))].join(", ")} for models in its catalog, and a model's own API for the rest (${[...new Set(latest.rows.filter((r) => r.review?.transport === "direct-api").map((r) => r.displayName))].join(", ") || "none"}).`);
  const search = searchOf(latest);
  const before = previous ? searchOf(previous) : search;
  out.push(`- Search: ${SEARCH_NAMES[search]}.${before !== search ? ` The ${date(previous)} review searched with ${SEARCH_NAMES[before]}, so a difference between the two may come from search as well as from the models or the candidates.` : ""}`);
  const firsts = latest.rows.filter((row) => row.review?.candidateOrder?.[0] === subject);
  if (firsts.length) out.push(`- ${firsts.map((row) => row.displayName).join(", ")} saw ${subject} first in ${firsts.length > 1 ? "their lists" : "its list"}. The methodology's rule 2 says ${subject} is never first, but the script didn't enforce it until 2026-11-19, and does now. ${firsts.length > 1 ? "Those reviews are" : "That review is"} kept and counted, and flagged here.`);
  out.push(`- One verdict per model is a sample, not a rate. A result is about the models that ran, on that date.`);
  const firstIn = (series) => series.rows.filter((row) => row.review?.candidateOrder?.[0] === subject).map((row) => row.displayName);
  if (all.length > 1) out.push(`- Earlier reviews, still published: ${all.slice(0, -1).map((s) => `${date(s)} (${headline(s, subject)}${firstIn(s).length ? ` ${firstIn(s).join(", ")} saw ${subject} first, which rule 2 forbids.` : ""})`).join("; ")}`);
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
