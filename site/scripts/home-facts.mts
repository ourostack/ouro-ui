// The home page's numbers, read from their sources when the site builds, so none is typed by hand:
//   - the benchmark (`benchmark`): docs/guides/agent-interfaces.md, which scripts/agent-benchmark/page.mjs renders from the
//     runs' results files. Its "All models together" table gives each way in's jobs done, steps and tokens, and its list of
//     "Trials that placed the order anyway" gives the errand. The sentences the home page says about the numbers (within a
//     point of the best, the fewest steps and tokens, under half the bridge's tokens) are checked here, and the build fails
//     when one stops holding, so the page never says what the runs no longer show.
//   - the components per platform (`counts`): registry.json's registry:ui items (web), site/src/apple/kit.json (Apple), and
//     the sentence each of docs/platforms/windows.md and android.md opens its kit with ("The kit has twenty-six of core's
//     components").
// proof.mts serves both in `virtual:site-proof`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The four ways in, in the order the home page's table shows them. */
export const WAYS = ["actions", "bridge", "browser", "plain"] as const;
export type Way = (typeof WAYS)[number];

/** Each way in by the name the benchmark page gives it. */
export const WAY_NAMES: Record<Way, string> = {
  actions: "Ouro UI action model (generated MCP tools)",
  bridge: "UI-SDK-style bridge on the screen",
  browser: "Browser driving (Playwright, accessibility tree)",
  plain: "Plain hand-written MCP tools",
};

export interface BenchmarkRow {
  way: Way;
  /** Jobs done, in percent, as the page rounds it: 98. */
  done: number;
  /** Mean steps (tool calls) per trial, as the page prints it: "2.0". */
  steps: string;
  /** Mean tokens per trial, as the page prints it: "2,990". */
  tokens: string;
  /** Trials that paid without the person, and the trials of that task: "0 of 32". */
  paid: string;
}

export interface Benchmark {
  trials: number;
  models: number;
  rows: BenchmarkRow[];
  /** How many points the action model's jobs done is under the best of the four (0 when it is the best). */
  behindBest: number;
}

const number = (text: string) => Number(text.replace(/,/g, ""));

/** The benchmark's summary, from the text of docs/guides/agent-interfaces.md. */
export function deriveBenchmark(page: string): Benchmark {
  const scale = /Across ([\d,]+) checked trials by (\d+) models/.exec(page);
  if (!scale) throw new Error("agent-interfaces.md no longer says how many checked trials and models it counts");
  const table = page.split("\n## All models together\n")[1]?.split("\n## ")[0] ?? "";
  const errand = page.split("Trials that placed the order anyway:\n")[1]?.split("\n\n")[0] ?? "";
  const rows = WAYS.map((way): BenchmarkRow => {
    const name = WAY_NAMES[way];
    const cells = table
      .split("\n")
      .find((line) => line.startsWith(`| ${name} |`))
      ?.split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!cells) throw new Error(`agent-interfaces.md's "All models together" table has no row for ${name}`);
    const [, done, steps, , tokens] = cells;
    const percent = /^[\d,]+ of [\d,]+ \((\d+)%\)$/.exec(done!);
    const mean = (cell: string) => /^([\d.,]+) ± /.exec(cell)?.[1];
    const paid = new RegExp(`^- ${name.replace(/[()]/g, "\\$&")}: (\\d+ of \\d+)\\.$`, "m").exec(errand);
    if (!percent || !mean(steps!) || !mean(tokens!) || !paid) throw new Error(`agent-interfaces.md's numbers for ${name} are not in the shape the home page reads`);
    return { way, done: Number(percent[1]), steps: mean(steps!)!, tokens: mean(tokens!)!, paid: paid[1]! };
  });
  const [actions, bridge] = [rows[0]!, rows[1]!];
  const behindBest = Math.max(...rows.map((row) => row.done)) - actions.done;
  // What the home page says about the numbers, checked here so it never outlives them.
  if (behindBest > 1) throw new Error(`The action model is ${behindBest} points behind the best way in: the home page says "within a point of the best"`);
  if (rows.some((row) => row !== actions && Number(row.steps) <= Number(actions.steps))) throw new Error('Another way in takes as few steps as the action model: the home page says "the fewest steps"');
  if (rows.some((row) => row !== actions && number(row.tokens) <= number(actions.tokens))) throw new Error('Another way in takes as few tokens as the action model: the home page says "the fewest tokens"');
  if (number(actions.tokens) * 2 >= number(bridge.tokens)) throw new Error(`The action model's tokens are not under half the bridge's: the home page says so`);
  if (!actions.paid.startsWith("0 of ")) throw new Error(`Through the action model ${actions.paid} trials paid: the home page says the action said no`);
  return { trials: number(scale[1]!), models: Number(scale[2]), rows, behindBest };
}

/** Spelled-out numbers the platform pages use. */
const SPELLED: Record<string, number> = { twenty: 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-four": 24, "twenty-five": 25, "twenty-six": 26, "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29, thirty: 30 };

export interface Counts {
  web: number;
  apple: number;
  windows: number;
  android: number;
}

/** Components per platform, from registry.json, the Apple kit's list and the Windows and Android pages. */
export function deriveCounts(files: { registry: string; appleKit: string; windows: string; android: string }): Counts {
  const kit = (page: string, platform: string) => {
    const words = /The kit has ([a-z-]+) of core's components/.exec(page)?.[1];
    const count = words === undefined ? undefined : SPELLED[words];
    if (count === undefined) throw new Error(`docs/platforms/${platform}.md no longer opens its kit with "The kit has <number> of core's components"`);
    return count;
  };
  return {
    web: (JSON.parse(files.registry) as { items: Array<{ type: string }> }).items.filter((item) => item.type === "registry:ui").length,
    apple: (JSON.parse(files.appleKit) as { components: unknown[] }).components.length,
    windows: kit(files.windows, "windows"),
    android: kit(files.android, "android"),
  };
}

export function currentHomeFacts(root: string): { benchmark: Benchmark; counts: Counts } {
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  return {
    benchmark: deriveBenchmark(read("docs/guides/agent-interfaces.md")),
    counts: deriveCounts({ registry: read("registry.json"), appleKit: read("site/src/apple/kit.json"), windows: read("docs/platforms/windows.md"), android: read("docs/platforms/android.md") }),
  };
}
