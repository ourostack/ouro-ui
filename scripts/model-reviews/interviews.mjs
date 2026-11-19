#!/usr/bin/env node
// interviews.mjs: the model interviews, a second series beside model-reviews.mjs's original question. Each model is a
// customer interviewed by the Mom Test: its own practice first, then three real jobs at a scale, a regret question,
// and Ouro UI named only in the last question. The questions, jobs, scales, arms, tools and budget were registered
// before any run in ourostack/ouro-ui-core's decision record docs/decisions/2026-11-19-model-interviews.md; a change to
// any of them starts a new series. Run privately, outside this repository:
//
//   node scripts/model-reviews/interviews.mjs --preflight --inference copilot-first --output-dir <new folder>
//   node scripts/model-reviews/interviews.mjs --inference copilot-first --output-dir <new folder>
//   node scripts/model-reviews/interviews.mjs --inference copilot-first --models grok-4-7 --arms listed --scales product-team --output-dir <new folder>
//
// It shares the original series' runtime, tools, search, pinned sources, redaction and records (METHODOLOGY.md,
// "The interviews series"), and writes run.json with `series: "interviews"`, so the two series' counts never mix.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import {
  FETCH_DESC,
  FETCH_PARAMS,
  MAX_NUDGES,
  SEARCH_DESC,
  SUBJECT,
  SEARCH_PARAMS,
  assertPrivateOutputDirectory,
  compactTranscript,
  createLogger,
  createTranscriptCollector,
  fetchUrl,
  handleResearch,
  parseOptions,
  redactSecrets,
  resolveResearchUrl,
  runPool,
  searchHealth,
  serializeJson,
  sessionOptions,
  shuffle,
  snapshotFingerprint,
  startRuntime,
  stopRuntime,
} from "./model-reviews.mjs";

/** The series marker every interviews run.json carries; the original series' page refuses a run that has it. */
export const SERIES = "interviews";

// ---- the script, as registered -----------------------------------------------------------------
// Every string in this section is the decision record's, word for word (core's docs/decisions/2026-11-19-model-interviews.md).

/** Turn 1, "look before you zoom". */
export const LOOK_BEFORE_YOU_ZOOM = "Before any job: when you build an interface that people will use, what's the hardest part, and how do you know it's good? Walk me through how you checked the last screen you built: what you ran, what you looked at, and what you missed. And is building good human interfaces even a problem for you? If it isn't, say so.";

/** The requirement every job ends with. */
export const REQUIREMENT = "and show it's good for the people who'll use it.";

/** The three jobs, from our own customers. */
export const JOBS = {
  chat: { title: "A chat app", text: "A chat app for a company's people, with web, iPhone, Android, Windows and Mac clients. People use it all day. Agents post into conversations too, including interactive cards a person can act on, and other agents need to operate the app itself: call its actions and read its state." },
  consumer: { title: "A consumer app", text: "A consumer cooking app, on the web and on phones: recipes, a shopping list and cook mode. People use it with messy hands in a kitchen, and an assistant agent should be able to do anything a person can, such as adding a recipe's ingredients to the list." },
  "agent-tooling": { title: "Agent tooling", text: "A tool where coding agents keep their work state, tasks and handoffs, and people review and steer them: a desktop app and a web view. Agents operate it more than people do, but the people decide." },
};
export const JOB_IDS = Object.keys(JOBS);

/** The two scales, which name no team size in the job itself. */
export const SCALES = {
  "product-team": { title: "Product team", text: "You're the coding agent for the team that builds and keeps improving it." },
  "large-company": { title: "Large company", text: "You're one of many coding agents at a large company that builds it. Many teams ship on a shared design system, with accessibility compliance, governance over what ships, several platforms, and agents across the company building on it." },
};
export const SCALE_IDS = Object.keys(SCALES);

/** The two research arms: `listed` measures merit, `open` whether agents find Ouro at all. */
export const ARMS = ["listed", "open"];
export const OPEN_ARM = "Find the options yourself.";
export const RESEARCH_INSTRUCTION = "Research what you need with search and fetch_url, then call record_decision.";

/** Turn 5, regret. */
export const REGRET = "Imagine it's a year later and the choices you made went badly. What went wrong? And what slowed you down or confused you while you researched?";

/** Turn 6, Ouro named last. */
export const OURO_QUESTION = "One of the toolkits in this space is Ouro UI: https://github.com/ourostack/ouro-ui. Look at it as much as you need. If you didn't pick it: what would stop you from using it on a real team, and what would you have to see to switch to it? If you did: what would stop a team from adopting it? Either way, what would that let you do that you can't today?";

/** The characters of search and fetch results one session may read, across its three jobs (the record, section 4). */
export const INTERVIEW_RESEARCH_BUDGET = 900_000;

// ---- the harness's own words, the same for every session ---------------------------------------

export const INTERVIEW_BUDGET_REACHED = "Research budget reached: call record_decision or answer, whichever the question asks for, with what you have.";

/** The system prompt: the tools and the rules, and nothing about any job, scale, arm or toolkit. */
export function renderInterviewSystemPrompt(asOf) {
  return `The research cutoff is ${asOf}. Some GitHub repositories are read at revisions captured for this cutoff; other web pages are captured when first fetched. Prefer current primary sources; distinguish documented facts from your inferences and uncertainty.

You have four tools:
1. **search** — search the web for information.
2. **fetch_url** — fetch a public URL, including GitHub directories, source files, and documentation. Follow the returned startIndex to continue reading a long document.
3. **record_decision** — call this once to end a question that asks for it.
4. **answer** — call this once to end any other question.

You MUST call a tool on every turn, and end every question with record_decision or answer. Take your time. Your session can read ${INTERVIEW_RESEARCH_BUDGET.toLocaleString("en-US")} characters of search and fetch results across all its questions; past that, both tools say so.

Your words may appear verbatim on a public website; speak in your own voice.`;
}

/** A job's turn: the job ending with the requirement, the scale, the arm's list or none, then the instruction. */
export function renderJobPrompt(job, scale, candidates) {
  const list = candidates ? candidates.map((candidate, index) => `${index + 1}. **${candidate.name}** — ${candidate.url}`).join("\n") : OPEN_ARM;
  return `${JOBS[job].text.replace(/\.$/, "")}, ${REQUIREMENT}\n\n${SCALES[scale].text}\n\n${list}\n\n${RESEARCH_INSTRUCTION}`;
}

/** One session's script, from its recorded order: the system prompt and its six turns, and their hash. */
export function renderScript({ asOf, arm, scale, jobOrder, candidates }) {
  if (!ARMS.includes(arm)) throw new Error(`Unknown arm ${arm}`);
  if (!SCALE_IDS.includes(scale)) throw new Error(`Unknown scale ${scale}`);
  if (arm === "listed" && !candidates?.length) throw new Error("The listed arm lists the candidates");
  if (arm === "open" && candidates) throw new Error("The open arm lists nothing");
  if (candidates?.[0]?.name === SUBJECT) throw new Error(`${SUBJECT} is never first in a list`);
  const system = renderInterviewSystemPrompt(asOf);
  const turns = [
    { id: "look", kind: "look", tool: "answer", prompt: LOOK_BEFORE_YOU_ZOOM },
    ...jobOrder.map((job) => ({ id: `job:${job}`, kind: "job", job, tool: "record_decision", prompt: renderJobPrompt(job, scale, candidates) })),
    { id: "regret", kind: "regret", tool: "answer", prompt: REGRET },
    { id: "ouro", kind: "ouro", tool: "answer", prompt: OURO_QUESTION },
  ];
  const promptSha256 = crypto.createHash("sha256").update(JSON.stringify([system, ...turns.map(({ prompt }) => prompt)])).digest("hex");
  return { system, turns, promptSha256 };
}

/**
 * The listed arm's order for one session: a uniform shuffle, except that Ouro UI is never first (METHODOLOGY.md,
 * rule 2). When the shuffle puts it first, it trades places with one of the others, chosen at random, so every other
 * place stays equally likely for it. It's the same rule as the original series' `orderCandidates`.
 */
export function orderListedCandidates(candidates, subject = SUBJECT, random = Math.random) {
  const order = shuffle(candidates, random);
  if (order.length > 1 && order[0].name === subject) {
    const other = 1 + Math.floor(random() * (order.length - 1));
    [order[0], order[other]] = [order[other], order[0]];
  }
  return order;
}

/** A session's script in a fresh random order: the jobs, and in the listed arm the candidates, with Ouro UI never first. */
export function buildScript(experiment, arm, scale, random = Math.random) {
  const jobOrder = shuffle(JOB_IDS, random);
  const candidates = arm === "listed" ? orderListedCandidates(experiment.candidates, SUBJECT, random) : null;
  return { ...renderScript({ asOf: experiment.asOf, arm, scale, jobOrder, candidates }), jobOrder, candidateOrder: candidates ? candidates.map(({ name }) => name) : null };
}

// ---- tools -------------------------------------------------------------------------------------

export const DECISION_FIELDS = ["primaryPick", "pairings", "why", "showItsGood", "unsure", "sources"];
const DECISION_DESC = "Record your decision for the job you were just given, once your research is done. Call this once per job. Your words may appear verbatim on a public website attributed to you.";
export const DECISION_PARAMS = {
  type: "object",
  properties: {
    primaryPick: { type: "string", description: "Your primary pick: what you'd build it with, by name. It needn't be on any list." },
    pairings: { type: "array", items: { type: "string" }, description: "What you'd pair with your primary pick, by name, if anything: other toolkits, libraries or protocols. An empty list if nothing." },
    why: { type: "string", description: "Why you'd build it with this, for this job and scale, and what you weighed it against." },
    showItsGood: { type: "string", description: "How you'd show the result is good for the people who'll use it: what you'd run, look at or measure." },
    unsure: { type: "string", description: "What you're unsure of." },
    sources: { type: "array", items: { type: "string" }, description: "The pages you relied on: URLs you fetched with fetch_url in this session. At least one." },
  },
  required: DECISION_FIELDS,
  additionalProperties: false,
};
const ANSWER_DESC = "Answer the question you were just asked, in your own words. Call this once per question that doesn't ask for record_decision. Your words may appear verbatim on a public website attributed to you.";
export const ANSWER_PARAMS = { type: "object", properties: { answer: { type: "string", description: "Your answer." } }, required: ["answer"], additionalProperties: false };

/** The fetches in a session that returned content. */
const fetchedActions = (rounds) => rounds.flatMap(({ actions }) => actions).filter((action) => action.type === "fetch" && !action.error && typeof action.result === "string" && action.result.length > 0 && action.source);

/** Throws unless `url` is a page the session fetched, compared at the revision a fetch reads. */
export function assertFetched(url, rounds, candidates) {
  let target;
  try {
    target = resolveResearchUrl(url, candidates);
  } catch {
    throw new Error(`sources must be URLs you fetched; ${JSON.stringify(url)} is not a URL`);
  }
  const fetched = fetchedActions(rounds);
  if (!fetched.some((action) => resolveResearchUrl(action.url, candidates) === target || resolveResearchUrl(action.source.url, candidates) === target)) {
    throw new Error(`sources must be pages you fetched with fetch_url in this session; you haven't fetched ${url}`);
  }
}

const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

/** A decision as submitted, or a thrown rule the model can fix. Nothing is edited. */
export function validateDecision(decision, rounds, candidates) {
  if (!decision || typeof decision !== "object") throw new Error("record_decision must submit an object");
  for (const field of ["primaryPick", "why", "showItsGood", "unsure"]) if (!nonEmpty(decision[field])) throw new Error(`record_decision.${field} must be a non-empty string`);
  if (!Array.isArray(decision.pairings) || !decision.pairings.every(nonEmpty)) throw new Error("record_decision.pairings must be a list of names, or an empty list");
  if (!Array.isArray(decision.sources) || decision.sources.length === 0 || !decision.sources.every(nonEmpty)) throw new Error("record_decision.sources must list at least one page you fetched");
  for (const source of decision.sources) assertFetched(source, rounds, candidates);
  return Object.fromEntries(DECISION_FIELDS.map((field) => [field, decision[field]]));
}

export function validateAnswer(answer) {
  if (!answer || typeof answer !== "object" || !nonEmpty(answer.answer)) throw new Error("answer.answer must be a non-empty string");
  return { answer: answer.answer };
}

/**
 * record_decision's and answer's handler. A call is refused, with the reason as text the model reads, when the
 * question asks for the other tool, or when a decision breaks a rule; the refusal is a failure result, which keeps the
 * session going, so the model can fix it and call again (METHODOLOGY.md, rule 6).
 */
export function handleTurnTool(name, args, invocation, { state, collector, research, log }) {
  const action = collector.ensureAction(invocation.toolCallId, name);
  action.turn = state.turn?.id ?? null;
  let value;
  try {
    if (!state.turn) throw new Error(`no question is open`);
    if (state.turn.tool !== name) throw new Error(`this question asks for ${state.turn.tool}, not ${name}`);
    if (state.turn.result) throw new Error(`this question already has its ${name}`);
    value = name === "answer" ? validateAnswer(args) : validateDecision(args, collector.rounds, research.candidates);
  } catch (error) {
    const expected = state.turn?.tool ?? name;
    const result = `${name === "answer" ? "Answer" : "Decision"} refused: ${error.message}. Fix this and call ${expected} again.`;
    collector.recordError(invocation.toolCallId, error, result);
    log(`  REFUSED: ${error.message}`);
    return { textResultForLlm: result, resultType: "failure", error: error.message };
  }
  Object.assign(action, { type: name === "answer" ? "answer" : "decision", ...value });
  state.turn.result = value;
  log(name === "answer" ? `Answer recorded for ${state.turn.id}` : `Decision for ${state.turn.id}: ${value.primaryPick}`);
  return name === "answer" ? "Answer recorded." : "Decision recorded.";
}

/** The tools of an interview session, the same four for every model and arm. */
export function interviewTools(sdk, { state, collector, search, research, log }) {
  const common = { skipPermission: true, defer: "never" };
  const research_ = (toolName, args, invocation, read) => {
    collector.ensureAction(invocation.toolCallId, toolName, args).turn = state.turn?.id ?? null;
    return handleResearch(toolName, args, invocation, { collector, log, read, budget: INTERVIEW_RESEARCH_BUDGET, budgetMessage: INTERVIEW_BUDGET_REACHED });
  };
  return [
    sdk.defineTool("search", { ...common, description: SEARCH_DESC, parameters: SEARCH_PARAMS, handler: ({ query }, invocation) => research_("search", { query }, invocation, async () => ({ text: await search(query) })) }),
    sdk.defineTool("fetch_url", { ...common, description: FETCH_DESC, parameters: FETCH_PARAMS, handler: ({ url, startIndex = 0 }, invocation) => research_("fetch_url", { url, startIndex }, invocation, () => fetchUrl(url, startIndex, research)) }),
    sdk.defineTool("record_decision", { ...common, description: DECISION_DESC, parameters: DECISION_PARAMS, isTerminal: true, handler: (args, invocation) => handleTurnTool("record_decision", args, invocation, { state, collector, research, log }) }),
    sdk.defineTool("answer", { ...common, description: ANSWER_DESC, parameters: ANSWER_PARAMS, isTerminal: true, handler: (args, invocation) => handleTurnTool("answer", args, invocation, { state, collector, research, log }) }),
  ];
}

/** What the harness says when a turn ends without its tool call, the same for every model. */
export function nudge(tool, budgetSpent) {
  if (tool === "record_decision") {
    return budgetSpent
      ? "You must call a tool every turn. Your research budget is spent: call record_decision with what you have."
      : "You must call a tool every turn. Use search or fetch_url to continue researching, or call record_decision when you have enough information.";
  }
  return budgetSpent
    ? "You must call a tool every turn. Your research budget is spent: call answer with what you have."
    : "You must call a tool every turn. Use search or fetch_url if you need to, or call answer to answer the question.";
}

// ---- what a session shows ----------------------------------------------------------------------

/** A page of ourostack's or of ouroboros.bot or ouro.bot. */
export function isOuroUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (["ouroboros.bot", "ouro.bot"].some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  const parts = url.pathname.split("/").filter(Boolean).map((part) => part.toLowerCase());
  if (host === "github.com" || host === "raw.githubusercontent.com") return parts[0] === "ourostack";
  if (host === "api.github.com") return parts[0] === "repos" && parts[1] === "ourostack";
  return false;
}

export const namesOuro = (text) => /\bouro\b/i.test(text);
const turnText = (turn) => (turn.answer ? turn.answer.answer : turn.decision ? [turn.decision.primaryPick, ...turn.decision.pairings, turn.decision.why, turn.decision.showItsGood, turn.decision.unsure].join("\n") : "");

/**
 * Whether a session found Ouro before the last question named it: it fetched a page of ourostack's or of
 * ouroboros.bot or ouro.bot, or named Ouro in a decision or an answer.
 */
export function foundOuro(rounds, turns) {
  const before = new Set(turns.filter((turn) => turn.kind !== "ouro").map((turn) => turn.id));
  const fetched = [...new Set(fetchedActions(rounds).filter((action) => before.has(action.turn) && (isOuroUrl(action.url) || isOuroUrl(action.source.url))).map((action) => action.url))];
  const named = turns.filter((turn) => before.has(turn.id) && namesOuro(turnText(turn))).map((turn) => turn.id);
  return { found: fetched.length > 0 || named.length > 0, fetched, named };
}

/** The candidates a session read, in the order it first fetched them, overall or in one turn. */
export function fetchedCandidates(rounds, turnId) {
  return [...new Set(fetchedActions(rounds).filter((action) => action.source.candidate && (turnId === undefined || action.turn === turnId)).map((action) => action.source.candidate))];
}

// ---- a session ---------------------------------------------------------------------------------

const TURN_TIMEOUT_MS = 45 * 60 * 1000;
export const sessionKey = ({ provider, arm, scale }) => `${provider}--${arm}--${scale}`;

async function runInterview(client, sdk, review, search, log, experiment, research, arm, scale, transcript) {
  const script = buildScript(experiment, arm, scale);
  const collector = createTranscriptCollector(log, transcript);
  const state = { turn: null };
  const onEvent = (event) => {
    collector.onEvent(event);
    const round = collector.rounds.at(-1);
    if (round && round.turn === undefined) round.turn = state.turn?.id ?? null;
  };
  const session = await client.createSession(sessionOptions(sdk, review, script.system, interviewTools(sdk, { state, collector, search, research, log }), onEvent));
  const turns = [];
  try {
    for (const turn of script.turns) {
      state.turn = { ...turn, result: null };
      log(`══ ${turn.id} ══`);
      const firstRound = collector.rounds.length + 1;
      let nudges = 0;
      for (let attempt = 0; attempt <= MAX_NUDGES && !state.turn.result; attempt++) {
        if (attempt > 0) nudges++;
        await session.sendAndWait({ prompt: attempt === 0 ? turn.prompt : nudge(turn.tool, collector.researched >= INTERVIEW_RESEARCH_BUDGET) }, TURN_TIMEOUT_MS);
        if (collector.compacted) throw new Error("Session compacted; refusing to keep a transcript with hidden replacement context");
      }
      if (!state.turn.result) throw new Error(`Model stopped without a valid ${turn.tool} for ${turn.id}`);
      turns.push({ id: turn.id, kind: turn.kind, ...(turn.job ? { job: turn.job } : {}), tool: turn.tool, rounds: [firstRound, collector.rounds.length], nudges, [turn.tool === "answer" ? "answer" : "decision"]: state.turn.result, ...(turn.kind === "job" ? { fetchedCandidates: fetchedCandidates(collector.rounds, turn.id) } : {}) });
    }
  } finally {
    await session.disconnect();
  }
  return {
    provider: review.provider,
    model: review.model,
    vendor: review.vendor,
    displayName: review.displayName,
    transport: review.transport,
    runId: experiment.runId,
    arm,
    scale,
    timestamp: new Date().toISOString(),
    jobOrder: script.jobOrder,
    candidateOrder: script.candidateOrder,
    promptSha256: script.promptSha256,
    sourceSnapshotSha256: snapshotFingerprint(experiment.candidates),
    turns,
    fetchedCandidates: fetchedCandidates(collector.rounds),
    foundOuro: foundOuro(collector.rounds, turns),
    transcript: collector.rounds,
    configuration: { contextTier: "default", reasoningEffort: "provider-default", infiniteSessions: false, largeOutputIndirection: false, systemMessageMode: "replace", tools: ["search", "fetch_url", "record_decision", "answer"], researchBudget: INTERVIEW_RESEARCH_BUDGET, search: search.backend },
  };
}

/** Checks one finished session against the run it claims to belong to, and re-renders its script from its recorded order. */
export function validateSession(result, selected, experiment) {
  if (result.error) throw new Error(`Incomplete session: ${sessionKey(result)}: ${result.error}`);
  const expected = selected.find(({ provider }) => provider === result.provider);
  if (!expected || ["model", "vendor", "displayName"].some((key) => result[key] !== expected[key])) throw new Error(`Model identity mismatch for ${result.provider}`);
  if (result.runId !== experiment.runId) throw new Error(`Session ${sessionKey(result)} belongs to a different run`);
  if (!ARMS.includes(result.arm) || !SCALE_IDS.includes(result.scale)) throw new Error(`Session ${sessionKey(result)} has an unknown arm or scale`);
  if (result.jobOrder.length !== JOB_IDS.length || JOB_IDS.some((job) => !result.jobOrder.includes(job))) throw new Error(`Session ${sessionKey(result)} job order is not the three jobs`);
  let candidates = null;
  if (result.arm === "listed") {
    const names = experiment.candidates.map(({ name }) => name);
    if (result.candidateOrder?.length !== names.length || new Set(result.candidateOrder).size !== names.length || names.some((name) => !result.candidateOrder.includes(name))) throw new Error(`Session ${sessionKey(result)} candidate set differs from the run`);
    candidates = result.candidateOrder.map((name) => experiment.candidates.find((candidate) => candidate.name === name));
  } else if (result.candidateOrder !== null) throw new Error(`Session ${sessionKey(result)} lists candidates in the open arm`);
  if (result.sourceSnapshotSha256 !== snapshotFingerprint(experiment.candidates)) throw new Error(`Session ${sessionKey(result)} source snapshot differs from the run`);
  const script = renderScript({ asOf: experiment.asOf, arm: result.arm, scale: result.scale, jobOrder: result.jobOrder, candidates });
  if (result.promptSha256 !== script.promptSha256) throw new Error(`Session ${sessionKey(result)} prompt hash does not match its recorded order and cutoff`);
  if (result.turns.map(({ id }) => id).join() !== script.turns.map(({ id }) => id).join()) throw new Error(`Session ${sessionKey(result)} did not finish every turn in order`);
  for (const turn of result.turns) {
    if (turn.tool === "answer") validateAnswer(turn.answer);
    else validateDecision(turn.decision, result.transcript, experiment.candidates);
  }
}

/** For each arm, scale and job, each primary pick's count; and for each arm and scale, how many sessions found Ouro first. */
export function summarizeInterviews(sessions) {
  const picks = {};
  const found = {};
  for (const session of sessions) {
    for (const turn of session.turns.filter(({ kind }) => kind === "job")) {
      const key = `${session.arm}/${session.scale}/${turn.job}`;
      picks[key] ??= {};
      picks[key][turn.decision.primaryPick] = (picks[key][turn.decision.primaryPick] ?? 0) + 1;
    }
    const key = `${session.arm}/${session.scale}`;
    found[key] ??= { sessions: 0, found: 0 };
    found[key].sessions++;
    if (session.foundOuro.found) found[key].found++;
  }
  return { sessions: sessions.length, picks, foundOuroBeforeTheLastQuestion: found };
}

function listOption(value, allowed, flag) {
  if (value === undefined) return allowed;
  const chosen = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  for (const entry of chosen) if (!allowed.includes(entry)) throw new Error(`${flag} names an unknown value ${entry}; use ${allowed.join(", ")}`);
  if (!chosen.length) throw new Error(`${flag} needs at least one of ${allowed.join(", ")}`);
  return allowed.filter((entry) => chosen.includes(entry));
}

/** The command line: model-reviews.mjs's options, and `--arms` and `--scales`, which narrow a run to some sessions (a trial, or a retry of a session that gave no answer). */
export function parseInterviewOptions(args) {
  const options = parseOptions(args, { arms: { type: "string" }, scales: { type: "string" } });
  return { ...options, arms: listOption(options.extra.arms, ARMS, "--arms"), scales: listOption(options.extra.scales, SCALE_IDS, "--scales") };
}

const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

export async function main(args = process.argv.slice(2)) {
  const options = parseInterviewOptions(args);
  const startedAt = new Date().toISOString();
  const experiment = { runId: crypto.randomUUID(), startedAt, asOf: startedAt, candidates: [] };
  const outputDirectory = assertPrivateOutputDirectory(options.outputDir);
  if (fs.existsSync(outputDirectory)) throw new Error(`Run directory already exists; choose a new one: ${outputDirectory}`);
  fs.mkdirSync(path.join(outputDirectory, "raw"), { recursive: true });

  const secrets = [];
  const research = { candidates: [], documents: new Map() };
  const handles = {};
  try {
    const { sdk, client, selected, runtime: shared, search } = await startRuntime(options, experiment, research, secrets, handles);
    const runtime = { ...shared, researchBudget: INTERVIEW_RESEARCH_BUDGET };
    const plan = { arms: options.arms, scales: options.scales };
    const reviewers = selected.map((review) => without(review, ["providerConfig", "fallback", "logFile", "log"]));
    fs.writeFileSync(path.join(outputDirectory, "run.json"), serializeJson({ series: SERIES, status: options.preflight ? "preflight" : "running", ...experiment, ...plan, runtime, reviewers }));
    if (options.preflight) {
      console.log("Access preflight complete: one search ran, and no model was interviewed.");
      return;
    }

    const sessions = selected.flatMap((review) => options.arms.flatMap((arm) => options.scales.map((scale) => ({ review, arm, scale }))));
    for (const entry of sessions) {
      const writeLog = createLogger(path.join(outputDirectory, "raw", `${sessionKey({ provider: entry.review.provider, ...entry })}.log`));
      entry.log = (message) => writeLog(redactSecrets(message, secrets));
    }
    const results = await runPool(sessions.map(({ review, arm, scale, log }) => async () => {
      const transcript = [];
      const label = `${review.displayName} (${arm}, ${scale})`;
      try {
        const result = await runInterview(client, sdk, review, search, log, experiment, research, arm, scale, transcript);
        validateSession(result, selected, experiment);
        console.log(`  ${label} → ${result.turns.filter(({ kind }) => kind === "job").map(({ job, decision }) => `${job}: ${decision.primaryPick}`).join("; ")}`);
        return result;
      } catch (error) {
        const message = redactSecrets(error.message, secrets);
        log(`FATAL: ${message}`);
        console.error(`  ${label} failed: ${message}`);
        return { provider: review.provider, model: review.model, vendor: review.vendor, displayName: review.displayName, transport: review.transport, arm, scale, error: message, transcript };
      }
    }), { concurrency: options.concurrency, maxLoad: options.maxLoad });

    const documents = await Promise.all(research.documents.values());
    const rawEvidence = serializeJson({ series: SERIES, documents, results });
    if (redactSecrets(rawEvidence, secrets) !== rawEvidence) throw new Error("Refusing to save a completed artifact containing a configured credential");
    fs.writeFileSync(path.join(outputDirectory, "raw", "evidence.json"), rawEvidence, { flag: "wx" });
    fs.mkdirSync(path.join(outputDirectory, "transcripts"));
    for (const result of results) {
      const { transcript, ...rest } = result;
      const compact = serializeJson({ series: SERIES, ...rest, rounds: compactTranscript(transcript) });
      if (redactSecrets(compact, secrets) !== compact) throw new Error("Refusing to save a transcript containing a configured credential");
      fs.writeFileSync(path.join(outputDirectory, "transcripts", `${sessionKey(result)}.json`), compact);
    }
    runtime.searches = searchHealth(results, INTERVIEW_BUDGET_REACHED);
    if (runtime.searches.made > 0 && runtime.searches.failed === runtime.searches.made) throw new Error(`Every one of the run's ${runtime.searches.made} searches failed, so it is not saved as a finished run`);
    const complete = results.filter((result) => !result.error);
    const summary = summarizeInterviews(complete);
    fs.writeFileSync(path.join(outputDirectory, "run.json"), serializeJson({
      series: SERIES,
      status: complete.length === results.length ? "complete" : "partial",
      ...experiment,
      ...plan,
      runtime,
      reviewers,
      failures: results.filter((result) => result.error).map(({ provider, arm, scale, error }) => ({ provider, arm, scale, error })),
      summary,
      sessions: complete.map((session) => ({ ...without(session, ["transcript"]), rounds: session.transcript.length, transcriptFile: `transcripts/${sessionKey(session)}.json` })),
    }));
    console.log(`Saved run: ${path.join(outputDirectory, "run.json")}`);
  } finally {
    await stopRuntime(handles);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nFatal: ${error.message}`);
    process.exitCode = 1;
  });
}
