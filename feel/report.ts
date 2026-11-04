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

function shown(entry: MeasureEntry): string {
  const [min, max] = entry.spread;
  const value = `${entry.median}${entry.unit === "count" ? "" : ` ${entry.unit}`}`;
  return entry.runs.length > 1 ? `${value} [${min}–${max}], ${entry.runs.length} runs` : value;
}

function verdict(entry: MeasureEntry): string {
  return entry.pass === undefined ? "reported" : entry.pass ? "pass" : "**over**";
}

/** The report as a Markdown table, for a job summary. */
export function markdown(entries: ReportEntry[]): string {
  const lines = ["## Ouro Feel", ""];
  for (const entry of entries) {
    lines.push(
      `### ${entry.case} (${entry.component}) on ${entry.engine} ${entry.engineVersion}, ${entry.os}: ${entry.pass ? "pass" : "FAIL"}`,
      "",
      entry.settled ? "" : "The case never came to rest before its time ran out.\n",
      "| Measure | Value | Limit | Result |",
      "| --- | --- | --- | --- |",
      ...Object.entries(entry.measures).map(([name, measure]) => `| \`${name}\` | ${shown(measure)} | ${measure.limit ?? ""} | ${verdict(measure)} |`),
      "",
    );
  }
  return `${lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n")}\n`;
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The report as a page: each case's measures beside the picture of its last frame. */
export function html(entries: ReportEntry[]): string {
  const sections = entries.map((entry) => {
    const rows = Object.entries(entry.measures)
      .map(([name, measure]) => `<tr class="${measure.pass === false ? "over" : ""}"><td><code>${escape(name)}</code></td><td>${escape(shown(measure))}</td><td>${measure.limit ?? ""}</td><td>${escape(verdict(measure).replaceAll("*", ""))}</td></tr>`)
      .join("\n");
    return `<section>
<h2>${escape(entry.case)} <small>${escape(entry.component)}</small> <span class="${entry.pass ? "pass" : "fail"}">${entry.pass ? "pass" : "fail"}</span></h2>
<p>${escape(entry.engine)} ${escape(entry.engineVersion)}, ${escape(entry.os)}${entry.settled ? "" : ". Never came to rest."}</p>
<div class="row"><table><thead><tr><th>Measure</th><th>Value</th><th>Limit</th><th>Result</th></tr></thead><tbody>
${rows}
</tbody></table>
<figure><img src="${escape(entry.shots.at(-1)!)}" alt="The page at the end of the last run"><figcaption>The page at the end of the last run</figcaption></figure></div>
</section>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ouro Feel report</title>
<style>
body { font: 15px/1.45 system-ui, sans-serif; margin: 24px; color: #1a1a1a; }
h1 { font-size: 22px; } h2 { font-size: 18px; margin-bottom: 4px; } small { color: #666; font-weight: normal; }
.row { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
table { border-collapse: collapse; } th, td { text-align: start; padding: 4px 12px; border-bottom: 1px solid #ddd; }
tr.over td { background: #fde8e8; } .pass { color: #0a6b2d; } .fail { color: #b3261e; }
figure { margin: 0; } img { width: 480px; border: 1px solid #ccc; border-radius: 6px; } figcaption { color: #666; font-size: 13px; }
</style></head>
<body><h1>Ouro Feel report</h1>
${sections.join("\n")}
</body></html>
`;
}
