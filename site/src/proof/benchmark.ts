import benchmarkPage from "@/docs/guides/agent-interfaces.md?raw";

/** The four ways in, in the order the copy deck names them, each with how docs/guides/agent-interfaces.md names it. */
export const WAYS = [
  { key: "actions", page: /^Ouro UI action model\b/, name: "Ouro's actions", note: null },
  { key: "bridge", page: /^UI-SDK-style bridge\b/, name: "A bridge on the screen", note: "tools that read and press the page's own controls, and refuse the person's" },
  { key: "browser", page: /^Browser driving\b/, name: "Driving the browser", note: null },
  { key: "plain", page: /^Plain hand-written MCP\b/, name: "A plain MCP server", note: "hand-written; only the model can decline" },
] as const;

export type WayKey = (typeof WAYS)[number]["key"];

/** One way in's results across every model, as the benchmark page states them. */
export interface WayResult {
  key: WayKey;
  name: string;
  note: string | null;
  done: number;
  run: number;
  /** Jobs done, as the page rounds it. */
  percent: number;
  steps: number;
  tokens: number;
  /** Grocery runs that placed the order and paid without the person, and grocery runs. */
  paid: number;
  paidOf: number;
}

export interface Benchmark {
  trials: number;
  models: number;
  ways: WayResult[];
  /** The grocery task's words, as the person typed them. */
  errand: string;
}

const number = (text: string) => Number(text.replace(/,/g, ""));

/**
 * Reads the benchmark's numbers from the page its results generate (docs/guides/agent-interfaces.md), so no number on
 * /proof/ is typed by hand: the "All models together" table, the paid-without-the-person list and the trial count.
 */
export function readBenchmark(page: string = benchmarkPage): Benchmark {
  const fail = (what: string): never => {
    throw new Error(`[ouro-site] /proof/ can't find the ${what} in docs/guides/agent-interfaces.md.`);
  };
  const totals = /Across ([\d,]+) checked trials by (\d+) models/.exec(page) ?? fail("trial and model count");
  const together = /^## All models together$([\s\S]*?)^## /m.exec(page)?.[1] ?? fail("overall table");
  const paidList = /Trials that placed the order anyway:\n\n([\s\S]*?)\n\n/.exec(page)?.[1] ?? fail("list of trials that placed the order");
  const errand = /Refuse: "(.+?)" \|/.exec(page)?.[1] ?? fail("grocery task");
  const ways = WAYS.map((entry) => {
    const cells = together
      .split("\n")
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
      .find((row) => entry.page.test(row[0] ?? "")) ?? fail(`row for ${entry.key}`);
    const done = /^([\d,]+) of ([\d,]+) \((\d+)%\)$/.exec(cells[1] ?? "") ?? fail(`jobs done for ${entry.key}`);
    const steps = /^([\d.]+) ±/.exec(cells[2] ?? "") ?? fail(`steps for ${entry.key}`);
    const tokens = /^([\d,]+) ±/.exec(cells[4] ?? "") ?? fail(`tokens for ${entry.key}`);
    const paid =
      paidList
        .split("\n")
        .map((line) => /^- (.+): (\d+) of (\d+)\.$/.exec(line))
        .find((match) => match && entry.page.test(match[1]!))
        ?.slice(1) ?? fail(`grocery count for ${entry.key}`);
    return {
      key: entry.key,
      name: entry.name,
      note: entry.note,
      done: number(done[1]!),
      run: number(done[2]!),
      percent: number(done[3]!),
      steps: number(steps[1]!),
      tokens: number(tokens[1]!),
      paid: number(paid[1]!),
      paidOf: number(paid[2]!),
    };
  });
  return { trials: number(totals[1]!), models: number(totals[2]!), ways, errand };
}

export const BENCHMARK = readBenchmark();

/** A way in's results, by key. */
export const way = (key: WayKey, benchmark: Benchmark = BENCHMARK): WayResult => benchmark.ways.find((entry) => entry.key === key)!;

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/** A count as a sentence opens with it: "Ten", or the figure past twelve. */
export const countWord = (count: number): string => WORDS[count] ?? String(count);

/** A number as the benchmark page writes it: 2,990. */
export const figure = (value: number): string => value.toLocaleString("en-US");
