// Ouro Feel's report: judges each case's runs against its limits, and writes them as JSON, Markdown
// and HTML. It holds counts and timings only, never page content.
import { basename } from "node:path";
import type { FeelCaseSpec } from "./cases.ts";
import type { RunResult } from "./probe/probe.ts";

export type Engine = "wkwebview" | "webkit" | "chromium";

/** One run of one case in one engine, as the runner collected it. */
export interface Run extends Omit<RunResult, "case"> {
  /** The engine's version: WebKit's bundle version in the WKWebView host, the browser's in Playwright. */
  engineVersion: string;
  os: string;
  /** The picture of the page at the end of the run. */
  shot: string;
}

/** One measure across a case's runs. */
export interface MeasureEntry {
  unit: "px" | "ms" | "count";
  /** Every run's value, in run order, so an app's gate can take its own medians and bands. */
  runs: number[];
  /** The median of the runs. */
  median: number;
  /** The smallest and largest run. */
  spread: [number, number];
  limit?: number;
  pass?: boolean;
}

/** One case in one engine: the shape of each entry in feel-report.json. */
export interface ReportEntry {
  case: string;
  component: string;
  engine: Engine;
  engineVersion: string;
  os: string;
  settled: boolean;
  measures: Record<string, MeasureEntry>;
  pass: boolean;
  shots: string[];
}

/** A time measure, judged on the median of its runs; every other measure is a count or a distance, judged on every run. */
export function isTime(name: string): boolean {
  return name.endsWith("Ms");
}

export function unitOf(name: string): MeasureEntry["unit"] {
  return name.endsWith("Px") ? "px" : isTime(name) ? "ms" : "count";
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Judges a case's runs: a count or distance passes when no run is over its limit, a time when the median is not. */
export function judge(spec: FeelCaseSpec, engine: Engine, runs: Run[]): ReportEntry {
  if (runs.length === 0) throw new Error(`${spec.name} has no runs to judge.`);
  const names = [...new Set(runs.flatMap((run) => Object.keys(run.measures)))];
  const missing = Object.keys(spec.limits).filter((name) => !names.includes(name));
  if (missing.length > 0) throw new Error(`${spec.name} has a limit on ${missing.join(", ")}, which the probe did not measure.`);
  const measures: Record<string, MeasureEntry> = {};
  for (const name of names) {
    const values = runs.map((run) => run.measures[name] ?? Number.NaN);
    const entry: MeasureEntry = { unit: unitOf(name), runs: values, median: median(values), spread: [Math.min(...values), Math.max(...values)] };
    const limit = spec.limits[name];
    if (limit !== undefined) {
      entry.limit = limit;
      entry.pass = isTime(name) ? entry.median <= limit : values.every((value) => value <= limit);
    }
    measures[name] = entry;
  }
  const settled = runs.every((run) => run.settled);
  return {
    case: spec.name,
    component: spec.component,
    engine,
    engineVersion: runs[0]!.engineVersion,
    os: runs[0]!.os,
    settled,
    measures,
    pass: settled && Object.values(measures).every((entry) => entry.pass !== false),
    shots: runs.map((run) => basename(run.shot)),
  };
}

/** What each measure means, in a few words, for people reading the report. */
export const LABELS: Record<string, string> = {
  frames: "Frames painted",
  blankFrames: "Blank frames: none of 5 points down the list lands on a row",
  blankFramesInset: "Blank frames, strict: no row 40 px inside the view",
  jumps: "Jumps: the reader's row moved 100 px or more in a frame",
  jumpMaxPx: "The biggest jump",
  jumpsStrict: "Strict jumps: moves over 2 px the input did not explain",
  jumpStrictMaxPx: "The biggest strict jump",
  shifts: "Shifts: the reader's row moved 8 px or more in a frame",
  anchorShiftPx: "The jumps, added up",
  anchorMovePx: "How far the reader's row drifted from where it was",
  deadInput: "Scrolls that moved nothing",
  wheelInputs: "Wheel and trackpad events",
  forcedLayouts: "Forced layouts",
  layoutReads: "Layout reads",
  layoutReadsPerFrame: "Layout reads in the busiest frame",
  rowsMounted: "Rows added to the page",
  longestFrameMs: "The longest frame",
};

const ENGINES: Record<Engine, string> = { wkwebview: "WKWebView", webkit: "Playwright's WebKit", chromium: "Playwright's Chromium" };

/** The engine, its version and the OS, as a person would say it. */
export function engineLine(entry: ReportEntry): string {
  return `${ENGINES[entry.engine]} ${entry.engineVersion}, ${entry.os}`;
}

function value(measure: MeasureEntry, at = measure.median): string {
  return `${at}${measure.unit === "count" ? "" : ` ${measure.unit}`}`;
}

/** One line that says whether the case passed, and if not, what was over. */
export function passLine(entry: ReportEntry): string {
  const runs = Object.values(entry.measures)[0]?.runs.length ?? 0;
  const where = `${entry.case} in ${engineLine(entry)}, ${runs} run${runs === 1 ? "" : "s"}`;
  if (entry.pass) return `✓ Pass: ${where}. Every judged measure is within its limit.`;
  const over = Object.entries(entry.measures)
    .filter(([, measure]) => measure.pass === false)
    .map(([name, measure]) => `${name} ${value(measure, isTime(name) ? measure.median : measure.spread[1])} (limit ${value(measure, measure.limit)})`);
  return `✗ Fail: ${where}. ${[entry.settled ? "" : "It never came to rest", ...over].filter(Boolean).join("; ")}.`;
}

function caption(entry: ReportEntry, does: string | undefined): string {
  return `${ENGINES[entry.engine]} at the end of run ${entry.shots.length}.${does ? ` ${does}` : ""}`;
}

function shown(entry: MeasureEntry): string {
  const [min, max] = entry.spread;
  return entry.runs.length > 1 ? `${value(entry)} [${min}–${max}]` : value(entry);
}

function split(entry: ReportEntry): [[string, MeasureEntry][], [string, MeasureEntry][]] {
  const all = Object.entries(entry.measures);
  return [all.filter(([, measure]) => measure.limit !== undefined), all.filter(([, measure]) => measure.limit === undefined)];
}

/** The report in Markdown, for a job summary: a pass line per case, then what was judged and what was only reported. */
export function markdown(entries: ReportEntry[], does: Record<string, string> = {}): string {
  const lines = ["## Ouro Feel", ""];
  for (const entry of entries) {
    const [judged, reported] = split(entry);
    lines.push(`### ${entry.case} (${entry.component})`, "", `**${passLine(entry)}**`, "");
    if (does[entry.case]) lines.push(does[entry.case]!, "");
    lines.push(
      "| Judged | Measure | Value | Limit | Result |",
      "| --- | --- | --- | --- | --- |",
      ...judged.map(([name, measure]) => `| ${LABELS[name] ?? name} | \`${name}\` | ${shown(measure)} | ${value(measure, measure.limit)} | ${measure.pass ? "✓ pass" : "✗ over"} |`),
      "",
      ...(reported.length ? ["| Reported | Measure | Value |", "| --- | --- | --- |", ...reported.map(([name, measure]) => `| ${LABELS[name] ?? name} | \`${name}\` | ${shown(measure)} |`), ""] : []),
      `Values are the median of the runs, with the range in brackets. A count or a distance fails if any run is over its limit; a time, on the median.`,
      "",
    );
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}`;
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The report as a page: a pass line per case, its measures, and a captioned picture of its last frame. */
export function html(entries: ReportEntry[], does: Record<string, string> = {}): string {
  const row = ([name, measure]: [string, MeasureEntry]) =>
    `<tr class="${measure.pass === false ? "over" : ""}"><td>${escape(LABELS[name] ?? name)}<br><code>${escape(name)}</code></td><td>${escape(shown(measure))}</td>${
      measure.limit === undefined ? "" : `<td>${escape(value(measure, measure.limit))}</td><td>${measure.pass ? "✓ pass" : "✗ over"}</td>`
    }</tr>`;
  const sections = entries.map((entry) => {
    const [judged, reported] = split(entry);
    return `<section>
<h2>${escape(entry.case)} <small>${escape(entry.component)}</small></h2>
<p class="verdict ${entry.pass ? "pass" : "fail"}">${escape(passLine(entry))}</p>
${does[entry.case] ? `<p>${escape(does[entry.case]!)}</p>` : ""}
<div class="row"><div>
<table><caption>Judged</caption><thead><tr><th>Measure</th><th>Value</th><th>Limit</th><th>Result</th></tr></thead><tbody>
${judged.map(row).join("\n")}
</tbody></table>
${reported.length ? `<table><caption>Reported</caption><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>
${reported.map(row).join("\n")}
</tbody></table>` : ""}
<p class="note">Values are the median of the runs, with the range in brackets. A count or a distance fails if any run is over its limit; a time, on the median.</p>
</div>
<figure><img src="${escape(entry.shots.at(-1)!)}" alt="${escape(caption(entry, does[entry.case]))}"><figcaption>${escape(caption(entry, does[entry.case]))}</figcaption></figure></div>
</section>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ouro Feel report</title>
<style>
body { font: 15px/1.5 system-ui, sans-serif; margin: 32px; color: #1a1a1a; max-width: 1200px; }
h1 { font-size: 24px; margin-bottom: 0; } .lede { color: #555; margin-top: 4px; }
h2 { font-size: 19px; margin: 28px 0 8px; } small { color: #666; font-weight: normal; }
.verdict { font-size: 17px; font-weight: 600; padding: 10px 14px; border-radius: 8px; }
.verdict.pass { background: #e6f4ea; color: #0a5c26; } .verdict.fail { background: #fde8e8; color: #9b1c14; }
.row { display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap; }
table { border-collapse: collapse; margin-bottom: 16px; } caption { text-align: start; font-weight: 600; padding: 4px 0; }
th, td { text-align: start; padding: 5px 12px; border-bottom: 1px solid #e3e3e3; vertical-align: top; } th { color: #555; font-weight: 500; }
td code { color: #666; font-size: 12px; } tr.over td { background: #fde8e8; } .note { color: #666; font-size: 13px; max-width: 560px; }
figure { margin: 0; max-width: 520px; } img { width: 100%; border: 1px solid #ccc; border-radius: 8px; } figcaption { color: #555; font-size: 13px; margin-top: 6px; }
</style></head>
<body><h1>Ouro Feel</h1>
<p class="lede">How an Ouro app feels in real use, measured in the engine it ships in.</p>
${sections.join("\n")}
</body></html>
`;
}
