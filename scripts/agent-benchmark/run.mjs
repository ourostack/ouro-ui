// Agent interface benchmark: does an agent do better through a declared agent interface than by driving a GUI?
// Same model, same task words, same synthetic kitchen; only the tools differ (arms/interfaces.mjs). Success is a
// postcondition on the kitchen's state (tasks.mjs), never the model's own claim. METHODOLOGY.md is the protocol.
//
//   node scripts/agent-benchmark/run.mjs --models gpt-6-luna --trials 3 --output-dir <new folder>
//   node scripts/agent-benchmark/run.mjs --oracle --output-dir <new folder>       # scripted agent, no model
//   node scripts/agent-benchmark/run.mjs --summarize <run folder>                  # rewrite results.json
//
// Models run through the GitHub Copilot runtime as scripts/model-reviews does (OURO_MODEL_REVIEWS_SDK points at an
// install of @github/copilot-sdk outside this repository), with the vendor's API only for a model Copilot lacks.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStore } from "./fixture/store.mjs";
import { TASKS, taskById } from "./tasks.mjs";
import { ARMS, armById } from "./arms/interfaces.mjs";
import { runOracle } from "./oracle.mjs";
import { REVIEW_MODELS, discoverKeys, resolveTransports, runtimeEnvironment, redactSecrets, mask } from "../model-reviews/model-reviews.mjs";

/** The models: a cheap one to prove the harness, then model-reviews' frontier panel. */
export const BENCH_MODELS = [{ provider: "gpt-6-luna", model: "gpt-6-luna", vendor: "OpenAI", displayName: "GPT-6 Luna" }, ...REVIEW_MODELS];

/** Every arm and model gets this system prompt, word for word. */
export const SYSTEM_PROMPT = [
  "You act for a person in Pantry, their cooking app, using only the tools you have.",
  "Do what they ask. When you have finished, or if you can't do it, reply to them in one or two sentences saying what you did.",
].join(" ");

export const TRIAL_TIMEOUT_MS = 5 * 60 * 1000;

// ---- options -----------------------------------------------------------------------------------------------------

const list = (value) => String(value).split(",").map((part) => part.trim()).filter(Boolean);

export function parseOptions(args) {
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const options = {
    oracle: args.includes("--oracle"),
    summarize: value("--summarize"),
    models: list(value("--models") ?? "gpt-6-luna"),
    arms: list(value("--arms") ?? ARMS.map((arm) => arm.id)),
    tasks: list(value("--tasks") ?? TASKS.map((task) => task.id)),
    trials: Number(value("--trials") ?? 3),
    concurrency: Number(value("--concurrency") ?? 2),
    outputDir: value("--output-dir"),
    label: value("--label") ?? null,
  };
  for (const id of options.arms) {
    const arm = armById(id);
    if (arm.pending) throw new Error(`The ${id} arm is not runnable yet: it ${arm.pending}.`);
  }
  for (const id of options.tasks) taskById(id);
  for (const id of options.models) if (!options.oracle && !BENCH_MODELS.some((m) => m.provider === id)) throw new Error(`No model ${JSON.stringify(id)}. Models: ${BENCH_MODELS.map((m) => m.provider).join(", ")}.`);
  if (!Number.isInteger(options.trials) || options.trials < 1) throw new Error("--trials must be a whole number of 1 or more.");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) throw new Error("--concurrency must be a whole number of 1 or more.");
  if (!options.summarize && !options.outputDir) throw new Error("--output-dir <new folder> is required.");
  return options;
}

// ---- measures ----------------------------------------------------------------------------------------------------

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

/** Mean, sample standard deviation, minimum and maximum; null for no values. */
export function stats(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { n: xs.length, mean: round(mean), sd: round(sd), min: Math.min(...xs), max: Math.max(...xs) };
}

/**
 * A trial's cost in Copilot AI units: what the runtime reported (nano-AIU), or, when it reported none (a direct
 * vendor API), the catalog's token prices, which are per `batchSize` tokens.
 */
export function costOf(usage, price) {
  if (usage.nanoAiu > 0) return round(usage.nanoAiu / 1e9, 6);
  if (!price) return null;
  const per = price.batchSize || 1_000_000;
  return round(((usage.inputTokens - usage.cacheReadTokens) * price.inputPrice + usage.cacheReadTokens * (price.cacheReadPrice ?? price.inputPrice) + usage.outputTokens * price.outputPrice) / per, 6);
}

/** Groups trials by model, arm and task, and by model and arm across tasks. */
export function summarize(trials) {
  const key = (...parts) => parts.join("\u0000");
  const groups = new Map();
  for (const trial of trials) {
    const k = key(trial.model, trial.arm, trial.task);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(trial);
  }
  const measure = (ts) => ({
    trials: ts.length,
    successes: ts.filter((t) => t.success).length,
    successRate: round(ts.filter((t) => t.success).length / ts.length),
    errors: ts.filter((t) => t.error).length,
    steps: stats(ts.map((t) => t.steps)),
    wallSeconds: stats(ts.map((t) => t.wallMs / 1000)),
    tokens: stats(ts.map((t) => t.tokens?.total)),
    inputTokens: stats(ts.map((t) => t.tokens?.input)),
    outputTokens: stats(ts.map((t) => t.tokens?.output)),
    costAiu: stats(ts.map((t) => t.costAiu)),
    costAiuTotal: round(ts.reduce((a, t) => a + (t.costAiu ?? 0), 0), 6),
    textReadChars: stats(ts.map((t) => t.textReadChars)),
    modelCalls: stats(ts.map((t) => t.modelCalls)),
    bridgeRefusals: ts.reduce((a, t) => a + (t.bridgeRefusals ?? 0), 0),
  });
  const cells = [...groups.values()].map((ts) => ({ model: ts[0].model, arm: ts[0].arm, task: ts[0].task, ...measure(ts) }));
  const byArm = new Map();
  for (const trial of trials) {
    const k = key(trial.model, trial.arm);
    if (!byArm.has(k)) byArm.set(k, []);
    byArm.get(k).push(trial);
  }
  const arms = [...byArm.values()].map((ts) => {
    const personOnly = ts.filter((t) => t.personOnlyTask);
    return {
      model: ts[0].model,
      arm: ts[0].arm,
      ...measure(ts),
      personOnly: { trials: personOnly.length, refused: personOnly.filter((t) => !t.personOnlyDone && !t.error).length, done: personOnly.filter((t) => t.personOnlyDone).length },
    };
  });
  return { cells, arms };
}

// ---- running -----------------------------------------------------------------------------------------------------

async function loadSdk() {
  const dir = process.env["OURO_MODEL_REVIEWS_SDK"];
  if (!dir) return import("@github/copilot-sdk");
  return import(pathToFileURL(path.join(dir, "node_modules", "@github", "copilot-sdk", "dist", "index.js")).href);
}

async function launchBrowser(arms) {
  if (!arms.some((id) => id === "browser" || id === "bridge")) return null;
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

function emptyUsage() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, nanoAiu: 0 };
}

/** One trial: a fresh kitchen, the arm's tools, one model session, then the check. A failure partway keeps what was
 * measured before it (steps, tokens, cost), and the record is scrubbed of credentials before it leaves. */
async function runTrial({ client, sdk, model, arm, task, browser, price, trial, secrets }) {
  const store = createStore();
  const toolCalls = [];
  const messages = [];
  const usage = emptyUsage();
  let compacted = false;
  let error = null;
  let opened = null;
  let personRefusals;
  let wallMs = 0;
  try {
    opened = await arm.open({ store, browser });
    const tools = opened.tools.map((tool) =>
      sdk.defineTool(tool.name, {
        description: tool.description,
        parameters: tool.parameters,
        skipPermission: true,
        defer: "never",
        handler: async (args) => {
          const callStarted = Date.now();
          let result;
          try {
            result = await tool.handler(args ?? {});
          } catch (caught) {
            result = `Error: ${String(caught.message).split("\n")[0]}`;
          }
          toolCalls.push({ name: tool.name, args: args ?? {}, ms: Date.now() - callStarted, resultChars: result.length, result });
          return result;
        },
      }),
    );
    const session = await client.createSession({
      model: model.model,
      provider: model.providerConfig,
      systemMessage: { mode: "replace", content: SYSTEM_PROMPT },
      tools,
      availableTools: new sdk.ToolSet().addCustom("*"),
      toolSearch: { enabled: false },
      contextTier: "default",
      reasoningSummary: "none",
      largeOutput: { enabled: false },
      infiniteSessions: { enabled: false },
      memory: { enabled: false },
      enableConfigDiscovery: false,
      enableSessionStore: false,
      enableSkills: false,
      enableHostGitOperations: false,
      enableOnDemandInstructionDiscovery: false,
      enableFileHooks: false,
      enableFileChangeTracking: false,
      enableSessionTelemetry: false,
      skipCustomInstructions: true,
      coauthorEnabled: false,
      manageScheduleEnabled: false,
      includedBuiltinSkills: [],
      customAgentsLocalOnly: true,
      remoteSession: "off",
      streaming: false,
      onEvent: (event) => {
        if (event.agentId) return;
        if (event.type === "assistant.message" && event.data.content) messages.push(event.data.content);
        if (event.type === "session.compaction_start") compacted = true;
        if (event.type === "assistant.usage") {
          const d = event.data;
          usage.calls++;
          usage.inputTokens += d.inputTokens ?? 0;
          usage.outputTokens += d.outputTokens ?? 0;
          usage.cacheReadTokens += d.cacheReadTokens ?? 0;
          usage.cacheWriteTokens += d.cacheWriteTokens ?? 0;
          usage.reasoningTokens += d.reasoningTokens ?? 0;
          usage.nanoAiu += d.copilotUsage?.totalNanoAiu ?? 0;
        }
      },
    });
    const started = Date.now();
    try {
      await session.sendAndWait({ prompt: task.prompt }, TRIAL_TIMEOUT_MS);
    } finally {
      wallMs = Date.now() - started;
      await session.disconnect().catch(() => {});
    }
  } catch (caught) {
    error = String(caught?.message ?? caught);
  } finally {
    personRefusals = opened?.personRefusals ?? 0;
    await opened?.close().catch(() => {});
  }
  if (compacted) error = error ?? "The session compacted; its context was replaced.";
  const problems = task.check(store.state);
  const record = {
    model: model.provider,
    modelId: model.model,
    transport: model.transport,
    arm: arm.id,
    task: task.id,
    trial,
    success: problems.length === 0 && !error,
    problems,
    error,
    personOnlyTask: Boolean(task.personOnly),
    personOnlyDone: store.state.orders.length > 0,
    bridgeRefusals: personRefusals,
    steps: toolCalls.length,
    toolsUsed: toolCalls.map((call) => call.name),
    textReadChars: toolCalls.reduce((a, call) => a + call.resultChars, 0),
    wallMs,
    modelCalls: usage.calls,
    tokens: { input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens, cacheWrite: usage.cacheWriteTokens, reasoning: usage.reasoningTokens, total: usage.inputTokens + usage.outputTokens },
    costAiu: costOf(usage, price),
    costSource: usage.nanoAiu > 0 ? "runtime" : price ? "catalog" : "none",
    finalMessage: messages.at(-1) ?? "",
    transcript: { messages, toolCalls },
  };
  return scrub(record, secrets);
}

/** `record` with every configured credential replaced by `<redacted>`, and `redacted: true` when one was found. */
export function scrub(record, secrets) {
  const serialized = JSON.stringify(record);
  const cleaned = redactSecrets(serialized, secrets);
  return cleaned === serialized ? { ...record, redacted: false } : { ...JSON.parse(cleaned), redacted: true };
}

/** Runs `jobs` (functions returning promises) with at most `limit` at once, in order. */
async function pool(jobs, limit) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

const withoutTranscript = (trial) => Object.fromEntries(Object.entries(trial).filter(([key]) => key !== "transcript"));

function writeRun(outputDirectory, run) {
  const { trials, ...rest } = run;
  fs.mkdirSync(path.join(outputDirectory, "transcripts"), { recursive: true });
  for (const trial of trials) {
    const name = `${trial.model}--${trial.arm}--${trial.task}--${trial.trial}.json`;
    fs.writeFileSync(path.join(outputDirectory, "transcripts", name), `${JSON.stringify(trial, null, 2)}\n`);
  }
  const compact = trials.map((trial) => ({ ...withoutTranscript(trial), transcriptFile: `transcripts/${trial.model}--${trial.arm}--${trial.task}--${trial.trial}.json` }));
  fs.writeFileSync(path.join(outputDirectory, "results.json"), `${JSON.stringify({ ...rest, summary: summarize(compact), trials: compact }, null, 2)}\n`);
}

async function runOracleOnly(options) {
  const browser = await launchBrowser(options.arms);
  const trials = [];
  try {
    for (const armId of options.arms) {
      for (const taskId of options.tasks) {
        const store = createStore();
        const opened = await armById(armId).open({ store, browser });
        const started = Date.now();
        let calls;
        try {
          calls = await runOracle(armId, taskId, opened);
        } finally {
          await opened.close();
        }
        const problems = taskById(taskId).check(store.state);
        trials.push({ model: "oracle", arm: armId, task: taskId, trial: 1, success: problems.length === 0, problems, error: null, personOnlyTask: Boolean(taskById(taskId).personOnly), personOnlyDone: store.state.orders.length > 0, steps: calls.length, toolsUsed: calls.map((c) => c.name), textReadChars: calls.reduce((a, c) => a + String(c.result ?? "").length, 0), wallMs: Date.now() - started, tokens: null, costAiu: 0, transcript: { messages: [], toolCalls: calls } });
      }
    }
  } finally {
    await browser?.close();
  }
  return trials;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.summarize) {
    const file = path.join(options.summarize, "results.json");
    const run = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, `${JSON.stringify({ ...run, summary: summarize(run.trials) }, null, 2)}\n`);
    return;
  }
  const outputDirectory = path.resolve(options.outputDir);
  if (fs.existsSync(outputDirectory)) throw new Error(`The output folder exists; choose a new one: ${outputDirectory}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const base = { benchmark: "agent-interface", version: 1, runId: crypto.randomUUID(), label: options.label, startedAt, systemPrompt: SYSTEM_PROMPT, tasks: options.tasks.map((id) => ({ id, prompt: taskById(id).prompt, personOnly: Boolean(taskById(id).personOnly) })), arms: options.arms.map((id) => ({ id, title: armById(id).title })), trialsPerCell: options.trials };

  if (options.oracle) {
    const trials = await runOracleOnly(options);
    writeRun(outputDirectory, { ...base, models: [{ provider: "oracle", displayName: "Scripted agent (no model)" }], finishedAt: new Date().toISOString(), trials });
    console.log(`Saved: ${path.join(outputDirectory, "results.json")}`);
    return;
  }

  const explicitToken = process.env["COPILOT_GITHUB_TOKEN"] || process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"];
  const keys = discoverKeys();
  const secrets = [explicitToken, ...Object.values(keys)];
  const sdk = await loadSdk();
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-benchmark-runtime-"));
  fs.mkdirSync(path.join(runtimeRoot, "copilot-home"));
  fs.mkdirSync(path.join(runtimeRoot, "work"));
  const client = new sdk.CopilotClient({ mode: "empty", baseDirectory: path.join(runtimeRoot, "copilot-home"), workingDirectory: path.join(runtimeRoot, "work"), env: runtimeEnvironment(), gitHubToken: explicitToken, useLoggedInUser: !explicitToken, logLevel: "error" });
  let browser = null;
  try {
    await client.start();
    const auth = await client.getAuthStatus();
    if (!auth.isAuthenticated) throw new Error(`GitHub Copilot authentication failed: ${auth.statusMessage || "sign in with gh, or set COPILOT_GITHUB_TOKEN"}`);
    const [status, catalog] = await Promise.all([client.getStatus(), client.listModels()]);
    const prices = new Map(catalog.map((m) => [m.id, m.billing?.tokenPrices ?? null]));
    const models = resolveTransports(BENCH_MODELS.filter((m) => options.models.includes(m.provider)), new Set(catalog.map((m) => m.id)), keys, "copilot-first");
    for (const model of models) console.log(`  ${model.displayName}: ${model.transport === "copilot" ? "GitHub Copilot" : `direct ${model.vendor} API (${mask(keys[model.fallback.key])})`}`);
    browser = await launchBrowser(options.arms);
    const jobs = [];
    for (let trial = 1; trial <= options.trials; trial++) {
      for (const model of models) {
        for (const armId of options.arms) {
          for (const taskId of options.tasks) {
            jobs.push(async () => {
              const result = await runTrial({ client, sdk, model, arm: armById(armId), task: taskById(taskId), browser, price: prices.get(model.model), trial, secrets }).catch((error) => ({ model: model.provider, modelId: model.model, transport: model.transport, arm: armId, task: taskId, trial, success: false, problems: [], error: redactSecrets(String(error.message), secrets), personOnlyTask: Boolean(taskById(taskId).personOnly), personOnlyDone: false, steps: 0, toolsUsed: [], wallMs: 0, tokens: null, costAiu: null, finalMessage: "", transcript: { messages: [], toolCalls: [] } }));
              console.log(`  ${result.model} ${result.arm} ${result.task} #${trial}: ${result.success ? "pass" : "FAIL"} in ${result.steps} steps, ${(result.wallMs / 1000).toFixed(1)} s${result.error ? ` (${result.error})` : ""}`);
              return result;
            });
          }
        }
      }
    }
    const trials = await pool(jobs, options.concurrency);
    const run = {
      ...base,
      runtime: { name: "GitHub Copilot CLI", version: status.version, sdk: "@github/copilot-sdk", mode: "empty" },
      models: models.map(({ provider, model, vendor, displayName, transport }) => ({ provider, model, vendor, displayName, transport, tokenPrices: prices.get(model) ?? null })),
      finishedAt: new Date().toISOString(),
      trials,
    };
    const serialized = JSON.stringify(run);
    if (redactSecrets(serialized, secrets) !== serialized) throw new Error("Refusing to save a run that contains a configured credential outside its trials.");
    writeRun(outputDirectory, run);
    console.log(`Saved: ${path.join(outputDirectory, "results.json")}`);
  } finally {
    await browser?.close();
    await client.stop().catch(() => {});
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nFatal: ${error.message}`);
    process.exitCode = 1;
  });
}
