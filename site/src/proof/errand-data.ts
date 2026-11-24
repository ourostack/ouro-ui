import actions from "@/scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--action-model--place-order--2.json";
import plain from "@/scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--plain-mcp--place-order--2.json";
import bridge from "@/scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--bridge--place-order--2.json";
import browser from "@/scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--browser--place-order--2.json";
import { WAYS, type WayKey } from "./benchmark";

/** A benchmark trial's transcript, as scripts/agent-benchmark/run.mjs writes it: the fields the Errand reads. */
export interface Transcript {
  model: string;
  arm: string;
  task: string;
  trial: number;
  success: boolean;
  problems: string[];
  steps: number;
  wallMs: number;
  modelCalls: number;
  finalMessage: string;
  transcript: { toolCalls: Array<{ name: string; args: unknown; ms: number; result: unknown }> };
}

/** Where each replayed run's transcript lives in the repository, for its link. */
const FILES: Record<WayKey, string> = {
  actions: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--action-model--place-order--2.json",
  bridge: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--bridge--place-order--2.json",
  browser: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--browser--place-order--2.json",
  plain: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--plain-mcp--place-order--2.json",
};

const RUNS: Record<WayKey, Transcript> = { actions, bridge, browser, plain } as Record<WayKey, Transcript>;

/** One tool call in a replay: what the agent called, what came back, and when, on the run's own clock. */
export interface ErrandStep {
  tool: string;
  args: string;
  said: string;
  at: number;
  ms: number;
}

/** One way in's run of the grocery job, ready to replay. */
export interface ErrandLane {
  key: WayKey;
  name: string;
  steps: ErrandStep[];
  reply: string;
  /** When the agent's reply landed, from the start: the run's wall time. */
  ms: number;
  /** Whether an order was placed and paid for without the person, as the benchmark's script found the app afterwards. */
  paid: boolean;
  href: string;
}

const parse = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const quote = (text: string) => `“${text}”`;

/**
 * What a tool's reply told the agent, in one line, read from the reply itself: the list's items, the screen's controls
 * and the one marked as the person's, a refusal's words, the page's status after a click, or that nothing came back.
 */
export function said(result: unknown, chars?: number): string {
  const value = parse(result);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.items === "string" || Array.isArray(record.items)) {
      const items = (parse(record.items) as Array<{ name: string }>).map((item) => item.name);
      return `${items.length} items: ${items.join(", ")}.`;
    }
    if (record.ok === false && record.error && typeof record.error === "object") return String((record.error as { message: unknown }).message);
    if (Array.isArray(record.components)) {
      const components = record.components as Array<{ label: string; confirm?: string }>;
      const marked = components.find((component) => component.confirm);
      return `${components.length} controls${marked ? `, and ${quote(marked.label)} is marked ${quote(marked.confirm!)}.` : "."}`;
    }
    if (Object.keys(record).length === 0) return "An empty reply: {}.";
  }
  const text = String(value);
  const status = /- status \[[^\]]*\]: (.+)/.exec(text)?.[1];
  if (status) return `The page now says ${quote(status)}`;
  return `The page as Playwright's snapshot, ${(chars ?? text.length).toLocaleString("en-US")} characters.`;
}

const args = (value: unknown): string => {
  const text = JSON.stringify(parse(value) ?? {});
  return text === "{}" ? "" : text;
};

/**
 * A transcript as a lane to replay. The transcript records each tool call's own time and the run's wall time, not the
 * model's thinking between calls, so that remainder is shared evenly among the model's calls: the replay runs on the
 * run's own clock, start to reply.
 */
export function lane(key: WayKey, run: Transcript = RUNS[key]): ErrandLane {
  const calls = run.transcript.toolCalls;
  const tools = calls.reduce((sum, call) => sum + call.ms, 0);
  const thinking = Math.max(0, run.wallMs - tools) / Math.max(1, run.modelCalls);
  let clock = 0;
  const steps = calls.map((call) => {
    clock += thinking;
    const step = { tool: call.name, args: args(call.args), said: said(call.result, (call as { resultChars?: number }).resultChars), at: Math.round(clock), ms: call.ms };
    clock += call.ms;
    return step;
  });
  return {
    key,
    name: WAYS.find((entry) => entry.key === key)!.name,
    steps,
    reply: run.finalMessage,
    ms: run.wallMs,
    paid: run.problems.some((problem) => problem.startsWith("an order was placed")),
    href: `https://github.com/ourostack/ouro-ui/blob/main/${FILES[key]}`,
  };
}

/** The grocery job four ways in, from Grok 4.7's second trial on each (the one trial of Ouro's actions that read the list first). */
export const ERRAND: ErrandLane[] = WAYS.map((entry) => lane(entry.key));

/** The longest run, which the whole replay lasts. */
export const ERRAND_MS = Math.max(...ERRAND.map((entry) => entry.ms));
