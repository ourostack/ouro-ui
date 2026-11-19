// Renders the site's model interviews page (docs/guides/model-interviews.md, served at /docs/model-interviews/) from the
// published interview runs in scripts/model-reviews/interviews-results/ and the synthesis in
// scripts/model-reviews/findings.json. Every pick, count and answer comes from the runs' run.json files; the findings
// and the "said it's a problem" judgments are synthesis, labelled as such on the page, with every quote linked to its
// transcript. pnpm claims:check renders it again and fails when the committed page differs.
//
//   node scripts/model-reviews/interviews-page.mjs docs/guides/model-interviews.md
//
// A results folder is named `<series>--<run>`, as for the original series. A model is interviewed once per series in
// each arm and scale; a second answer for the same session is refused, and a session is run again only when it gave none.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEW_MODELS, SUBJECT } from "./model-reviews.mjs";
import { ARMS, JOBS, JOB_IDS, SCALES, SCALE_IDS, SERIES, namesOuro, sessionKey } from "./interviews.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/ourostack/ouro-ui";
const RECORD = "https://github.com/ourostack/ouro-ui-core/blob/bf4539aad126b1d6999883eb84149f86b6acd567/docs/decisions/2026-11-19-model-interviews.md";
export const INTERVIEWS_RESULTS_DIR = path.join(here, "interviews-results");
export const FINDINGS_FILE = path.join(here, "findings.json");

/** The Mom Test signals a statement can carry (the record, section 6), strongest evidence first. */
export const SIGNALS = ["past-behavior", "workaround", "pain", "stakeholder", "goal", "idea", "not-a-pain", "surprise", "compliment", "hypothetical"];
const DISCONFIRMING = ["not-a-pain", "surprise"];
const COUNTS_FOR_NOTHING = ["compliment", "hypothetical"];
const PROBLEM_SAID = { problem: "yes", "not-a-problem": "no", unclear: "unclear" };

/** Every published interview run, oldest first: `interviews-results/<series>--<run>/run.json`. */
export function publishedInterviews(dir = INTERVIEWS_RESULTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((folder) => ({ folder, file: path.join(dir, folder, "run.json") }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ folder, file }) => ({ folder, ...JSON.parse(fs.readFileSync(file, "utf8")) }));
}

/** The findings file, checked: an empty or partial file renders; a malformed entry is refused with its fix. */
export function readFindings(file = FINDINGS_FILE) {
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return checkFindings(data);
}

export function checkFindings(data) {
  const problem = data.problem ?? [];
  const findings = data.findings ?? [];
  if (!Array.isArray(problem) || !Array.isArray(findings)) throw new Error("findings.json: `problem` and `findings` are lists");
  for (const entry of problem) {
    if (!entry || typeof entry.model !== "string" || !ARMS.includes(entry.arm) || !SCALE_IDS.includes(entry.scale) || !(entry.said in PROBLEM_SAID)) {
      throw new Error(`findings.json: a problem entry is { model, arm (${ARMS.join(" or ")}), scale (${SCALE_IDS.join(" or ")}), said (${Object.keys(PROBLEM_SAID).join(", ")}), quote }: ${JSON.stringify(entry)}`);
    }
  }
  const ids = new Set();
  for (const finding of findings) {
    if (!finding || typeof finding.id !== "string" || ids.has(finding.id)) throw new Error(`findings.json: every finding has a unique id: ${JSON.stringify(finding?.id)}`);
    ids.add(finding.id);
    if (typeof finding.finding !== "string" || !finding.finding.trim()) throw new Error(`findings.json: ${finding.id} needs its finding, in a sentence`);
    if (!SIGNALS.includes(finding.signal)) throw new Error(`findings.json: ${finding.id}'s signal is one of ${SIGNALS.join(", ")}`);
    if (!Array.isArray(finding.models) || !Array.isArray(finding.quotes ?? [])) throw new Error(`findings.json: ${finding.id} lists its models and quotes`);
    for (const quote of finding.quotes ?? []) {
      if (typeof quote?.model !== "string" || typeof quote.text !== "string" || typeof quote.transcript !== "string") throw new Error(`findings.json: ${finding.id}'s quotes are { model, text, transcript }, each verbatim and linked`);
    }
    if (finding.issue !== undefined && finding.issue !== null && !Number.isInteger(finding.issue)) throw new Error(`findings.json: ${finding.id}'s issue is an issue number, or null`);
  }
  return { problem, findings };
}

/** The runs grouped into series, oldest first, each with one row per session it tried: an interview, or why there is none. */
export function interviewSeriesOf(runs) {
  const groups = new Map();
  for (const run of runs) {
    if (run.series !== SERIES) throw new Error(`${run.folder} is not an interviews run (series ${JSON.stringify(run.series)}). Its results belong in scripts/model-reviews/results/.`);
    const split = run.folder.indexOf("--");
    if (split <= 0) throw new Error(`${run.folder}: a results folder is named <series>--<run>`);
    if (run.status === "preflight" || run.status === "running") throw new Error(`${run.folder} is a ${run.status} record, not a finished run. Remove it from interviews-results/.`);
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
        for (const session of run.sessions ?? []) {
          const key = sessionKey(session);
          if (rows.get(key)?.session) throw new Error(`Series ${id} has two interviews of ${key} (${rows.get(key).run.folder} and ${run.folder}). A model is interviewed once per series; run it again only when it gave no answer.`);
          rows.set(key, { key, provider: session.provider, displayName: session.displayName, arm: session.arm, scale: session.scale, session, run, earlier: rows.get(key)?.earlier ?? [] });
        }
        for (const failure of run.failures ?? []) {
          const key = sessionKey(failure);
          if (rows.get(key)?.session) continue;
          const displayName = run.reviewers?.find((r) => r.provider === failure.provider)?.displayName ?? REVIEW_MODELS.find((r) => r.provider === failure.provider)?.displayName ?? failure.provider;
          const earlier = [...(rows.get(key)?.earlier ?? []), run];
          rows.set(key, { key, provider: failure.provider, displayName, arm: failure.arm, scale: failure.scale, error: failure.error, attempts: earlier.length, run, earlier });
        }
      }
      return { id, runs: members, rows: [...rows.values()] };
    });
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const oneLine = (text) => String(text).replace(/\s*\n\s*/g, " ").trim();
const cell = (text) => oneLine(text).replace(/\|/g, "\\|");
const blob = (run, file) => `${REPO}/blob/main/scripts/model-reviews/interviews-results/${run.folder}/${file}`;
const transcriptLink = (row) => `[${row.key}](${blob(row.run, `transcripts/${row.key}.json`)})`;
const quoteLink = (transcript) => (/^https:\/\//.test(transcript) ? transcript : `${REPO}/blob/main/${transcript.replace(/^\//, "")}`);
const nameOf = (provider) => REVIEW_MODELS.find((r) => r.provider === provider)?.displayName ?? provider;
const panelOrder = (a, b) => {
  const index = (row) => {
    const at = REVIEW_MODELS.findIndex((r) => r.provider === row.provider);
    return at === -1 ? REVIEW_MODELS.length : at;
  };
  return index(a) - index(b) || a.provider.localeCompare(b.provider);
};

/** The primary picks for one arm, scale and job, with how many named Ouro. */
export function cellOf(series, arm, scale, job) {
  const rows = series.rows.filter((row) => row.arm === arm && row.scale === scale).sort(panelOrder);
  const answered = rows.filter((row) => row.session).map((row) => ({ row, turn: row.session.turns.find((turn) => turn.job === job) }));
  const ouro = answered.filter(({ turn }) => namesOuro(turn.decision.primaryPick)).length;
  return { rows, answered, ouro, barMet: answered.length > 0 && ouro * 2 > answered.length };
}

/** The headline, from the latest series' listed arm alone: the record's bar is more than half of the models that answered, in every job at both scales. */
export function interviewHeadline(series) {
  if (!series) return "No interview has been published yet. The series is registered, and this page fills in from its first run.";
  const cells = SCALE_IDS.flatMap((scale) => JOB_IDS.map((job) => cellOf(series, "listed", scale, job)));
  const met = cells.filter((c) => c.barMet).length;
  const listed = cells.some((c) => c.answered.length > 0);
  const open = series.rows.filter((row) => row.arm === "open" && row.session);
  const found = open.filter((row) => row.session.foundOuro.found).length;
  const merit = !listed
    ? "No listed-arm interview has finished yet."
    : met === cells.length
      ? `More than half of the models that answered picked ${SUBJECT} as their primary in all ${cells.length} listed jobs and scales. The record counts that as the models' choice only once the revealed-preference build confirms it, and this page doesn't report the build yet.`
      : `${SUBJECT} is not yet the models' choice: more than half of the models that answered picked it as their primary in ${met} of the ${cells.length} listed jobs and scales, and the record needs all ${cells.length}.`;
  const discover = open.length ? ` In the open arm, ${found} of ${plural(open.length, "session")} found ${SUBJECT} before the last question named it.` : "";
  return `${merit}${discover}`;
}

function renderFindings(out, findings) {
  out.push("## What the models asked for, and what we changed");
  out.push("");
  out.push("This section is synthesis: each answer split into statements, each statement given a Mom Test signal, and statements about the same thing clustered into a finding. Every quote is verbatim and links the transcript it came from, so it can be checked. A finding is filed as an issue labelled `model-review`, ranked by how many models raised it and how strong the evidence is.");
  out.push("");
  if (!findings.length) {
    out.push("No findings yet: they're filled in from the transcripts after a run.");
    out.push("");
    return;
  }
  const strength = (finding) => SIGNALS.indexOf(finding.signal);
  const ranked = (list) => [...list].sort((a, b) => b.models.length - a.models.length || strength(a) - strength(b) || a.id.localeCompare(b.id));
  const write = (finding) => {
    out.push(`### ${oneLine(finding.finding)}`);
    out.push("");
    const issue = Number.isInteger(finding.issue) ? ` [#${finding.issue}](${REPO}/issues/${finding.issue}).` : "";
    out.push(`Signal: ${finding.signal}. Raised by ${plural(finding.models.length, "model")}${finding.models.length ? `: ${finding.models.map(nameOf).join(", ")}` : ""}. Status: ${finding.status ?? "open"}.${issue}${finding.change ? ` What changed: ${oneLine(finding.change)}` : ""}`);
    if (finding.summary) {
      out.push("");
      out.push(oneLine(finding.summary));
    }
    if (finding.quotes?.length) {
      out.push("");
      for (const quote of finding.quotes) out.push(`- **${nameOf(quote.model)}**: "${oneLine(quote.text)}" ([transcript](${quoteLink(quote.transcript)}))`);
    }
    out.push("");
  };
  const supporting = ranked(findings.filter((f) => !DISCONFIRMING.includes(f.signal) && !COUNTS_FOR_NOTHING.includes(f.signal)));
  const disconfirming = ranked(findings.filter((f) => DISCONFIRMING.includes(f.signal)));
  const nothing = findings.filter((f) => COUNTS_FOR_NOTHING.includes(f.signal));
  if (!supporting.length) {
    out.push("No finding that asks for a change yet.");
    out.push("");
  }
  for (const finding of supporting) write(finding);
  out.push("### Disconfirming evidence: not a pain, or a surprise");
  out.push("");
  out.push("What could show Ouro UI is solving the wrong problem, kept as its own group beside the rest.");
  out.push("");
  if (!disconfirming.length) {
    out.push("None recorded.");
    out.push("");
  }
  for (const finding of disconfirming) write(finding);
  if (nothing.length) {
    out.push(`${plural(nothing.length, "finding")} that are compliments or hypotheticals count for nothing and aren't listed.`);
    out.push("");
  }
}

function renderCell(out, series, arm, scale, job) {
  const { rows } = cellOf(series, arm, scale, job);
  out.push(`### ${JOBS[job].title}, ${SCALES[scale].title.toLowerCase()}`);
  out.push("");
  if (!rows.length) {
    out.push("No model was interviewed here yet.");
    out.push("");
    return;
  }
  out.push("| Model | Primary pick | Pairings | Read during this job | Transcript |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const row of rows) {
    if (!row.session) {
      out.push(`| ${row.displayName} | no answer (${cell(row.error)}; ${plural(row.attempts, "attempt")}) | n/a | n/a | ${transcriptLink(row)} |`);
      continue;
    }
    const turn = row.session.turns.find((t) => t.job === job);
    const read = turn.fetchedCandidates?.length ? turn.fetchedCandidates.join(", ") : "none of the listed candidates";
    out.push(`| ${row.displayName} | ${cell(turn.decision.primaryPick)} | ${turn.decision.pairings.length ? cell(turn.decision.pairings.join(", ")) : "none"} | ${cell(read)} | ${transcriptLink(row)} |`);
  }
  out.push("");
}

/** The page, from `runs` (publishedInterviews()) and the findings file's contents (readFindings()). */
export function renderInterviewsPage(runs, findings = { problem: [], findings: [] }) {
  const all = interviewSeriesOf(runs);
  const latest = all.at(-1);
  const checked = checkFindings(findings);
  const out = [];
  out.push("# What models build with: interviews");
  out.push("");
  out.push(interviewHeadline(latest));
  out.push("");
  out.push(`Each frontier model is interviewed as a customer, by the Mom Test: its own practice before any toolkit is named, then three real jobs, each at a product team's scale and a large company's, then what went wrong a year later, and ${SUBJECT} named only in the last question. The questions were [registered before any run](${RECORD}) and don't change between runs; a change starts a new series. This series is kept apart from the [model reviews](model-reviews.md), which ask one question, and its counts never mix with theirs.`);
  out.push("");
  out.push(`Two research arms answer different questions. The **listed arm measures merit**: each job lists the same 20 candidates as the model reviews, by name and link only, in a fresh random order for each session. The **open arm measures discoverability**: the job lists nothing ("Find the options yourself."), so a loss there says agents don't find ${SUBJECT}, not that it's worse. Every pick, count and answer here is computed from the runs' records by a script.`);
  out.push("");
  renderFindings(out, checked.findings);
  if (latest) {
    out.push("## The listed arm: merit");
    out.push("");
    out.push(`Each model's primary pick and what it would pair with it, for each job and scale, and the candidates it read while it researched that job. The record counts ${SUBJECT} as the models' choice only when more than half of the models that answered pick it as their primary in every job at both scales here, and a build confirms it.`);
    out.push("");
    for (const scale of SCALE_IDS) for (const job of JOB_IDS) renderCell(out, latest, "listed", scale, job);
    out.push("## The open arm: discoverability");
    out.push("");
    const open = latest.rows.filter((row) => row.arm === "open").sort(panelOrder);
    out.push(`Whether each model found ${SUBJECT} before the last question named it: it fetched a page of ourostack's, ouroboros.bot or ouro.bot, or named Ouro in a decision or an answer.`);
    out.push("");
    for (const scale of SCALE_IDS) {
      const answered = open.filter((row) => row.scale === scale && row.session);
      out.push(`- ${SCALES[scale].title}: ${answered.filter((row) => row.session.foundOuro.found).length} of ${plural(answered.length, "model")} found it before being told.`);
    }
    out.push("");
    const providers = [...new Map(open.map((row) => [row.provider, row])).values()];
    if (providers.length) {
      out.push(`| Model | ${SCALE_IDS.map((scale) => SCALES[scale].title).join(" | ")} |`);
      out.push(`| --- | ${SCALE_IDS.map(() => "---").join(" | ")} |`);
      for (const { provider, displayName } of providers) {
        const cells = SCALE_IDS.map((scale) => {
          const row = open.find((r) => r.provider === provider && r.scale === scale);
          if (!row) return "not interviewed";
          if (!row.session) return "no answer";
          const { found, fetched, named } = row.session.foundOuro;
          if (!found) return "no";
          return `yes (${[fetched.length ? `fetched ${plural(fetched.length, "page")}` : "", named.length ? `named it in ${named.join(", ")}` : ""].filter(Boolean).join("; ")})`;
        });
        out.push(`| ${displayName} | ${cells.join(" | ")} |`);
      }
      out.push("");
    }
    for (const scale of SCALE_IDS) for (const job of JOB_IDS) renderCell(out, latest, "open", scale, job);
    out.push("## Before any job: look before you zoom");
    out.push("");
    out.push("Each model's first answer in each session, verbatim with line breaks joined, to the question it got before any job: what's hardest about building an interface people use, how it checked the last screen it built, and whether building good human interfaces is even a problem for it. Whether it said so is synthesis, read from the answer and recorded in the findings file; \"not judged yet\" means nobody has read it yet.");
    for (const provider of [...new Set(latest.rows.sort(panelOrder).map((row) => row.provider))]) {
      const rows = latest.rows.filter((row) => row.provider === provider);
      out.push("");
      out.push(`### ${rows[0].displayName}`);
      for (const arm of ARMS) {
        for (const scale of SCALE_IDS) {
          const row = rows.find((r) => r.arm === arm && r.scale === scale);
          if (!row) continue;
          out.push("");
          if (!row.session) {
            out.push(`**${arm === "listed" ? "Listed" : "Open"} arm, ${SCALES[scale].title.toLowerCase()}:** no answer (${oneLine(row.error)}).`);
            continue;
          }
          const judged = checked.problem.find((p) => p.model === provider && p.arm === arm && p.scale === scale);
          const said = judged ? `${PROBLEM_SAID[judged.said]} (synthesis)` : "not judged yet";
          out.push(`**${arm === "listed" ? "Listed" : "Open"} arm, ${SCALES[scale].title.toLowerCase()}** ([transcript](${blob(row.run, `transcripts/${row.key}.json`)})). Said building good human interfaces is a problem: ${said}.`);
          out.push("");
          out.push(`> ${oneLine(row.session.turns.find((turn) => turn.kind === "look").answer.answer)}`);
        }
      }
    }
    out.push("");
  }
  out.push("## How it's run");
  out.push("");
  out.push(`- The script, word for word, with its jobs, scales, arms, tools and budget: the [decision record](${RECORD}), the [methodology](${REPO}/blob/main/scripts/model-reviews/METHODOLOGY.md#the-interviews-series) and the [harness](${REPO}/blob/main/scripts/model-reviews/interviews.mjs).`);
  out.push("- Each model gets four sessions: the listed and open arms, each at a product team's scale and a large company's. Every session runs the same six questions in the same words; only the order of the three jobs, and of the listed candidates, is drawn fresh for each session.");
  out.push("- The tools, runtime and search are the model reviews', and every session has the same research budget: 900,000 characters of search and fetch results, because a session researches three jobs.");
  if (latest) {
    out.push(`- Runs in this series: ${latest.runs.map((run) => `[\`${run.folder}\`](${blob(run, "run.json")}) (cutoff ${run.asOf.slice(0, 16).replace("T", " ")} UTC)`).join(", ")}.`);
    out.push("- One interview per model, arm and scale is a sample, not a rate. A result is about the models that ran, on that date.");
  }
  if (all.length > 1) out.push(`- Earlier series, still published: ${all.slice(0, -1).map((s) => `${s.runs[0].startedAt.slice(0, 10)} (${interviewHeadline(s)})`).join("; ")}`);
  out.push("");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/model-reviews/interviews-page.mjs <out.md>");
    process.exitCode = 2;
  } else {
    fs.writeFileSync(target, renderInterviewsPage(publishedInterviews(), readFindings()));
    console.log(`Wrote ${target}`);
  }
}
