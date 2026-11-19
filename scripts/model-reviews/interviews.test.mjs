import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CANDIDATES, SEARCH_DESC, FETCH_DESC, createTranscriptCollector, handleResearch, searchHealth, snapshotFingerprint } from "./model-reviews.mjs";
import { renderPage, publishedRuns } from "./page.mjs";
import {
  ANSWER_PARAMS,
  DECISION_PARAMS,
  INTERVIEW_BUDGET_REACHED,
  INTERVIEW_RESEARCH_BUDGET,
  JOBS,
  JOB_IDS,
  LOOK_BEFORE_YOU_ZOOM,
  OPEN_ARM,
  OURO_QUESTION,
  REGRET,
  REQUIREMENT,
  RESEARCH_INSTRUCTION,
  SCALES,
  buildScript,
  foundOuro,
  handleTurnTool,
  interviewTools,
  isOuroUrl,
  nudge,
  orderListedCandidates,
  parseInterviewOptions,
  renderInterviewSystemPrompt,
  renderScript,
  summarizeInterviews,
  validateSession,
} from "./interviews.mjs";
import { checkFindings, interviewSeriesOf, publishedInterviews, readFindings, renderInterviewsPage } from "./interviews-page.mjs";
import { URL } from "node:url";

const asOf = "2026-11-19T00:00:00.000Z";
const sha = "a".repeat(40);
const pinned = CANDIDATES.map((candidate) => (candidate.url.startsWith("https://github.com/") ? { ...candidate, sha, committedAt: "2026-11-18T00:00:00Z", capturedAt: asOf } : { ...candidate, capturedAt: asOf }));
const experiment = { runId: "run-1", asOf, candidates: pinned };
const sequence = (values) => { let i = 0; return () => values[i++ % values.length]; };

test("the interview script is the decision record's, word for word", () => {
  // These strings are pinned from ourostack/ouro-ui-core's docs/decisions/2026-11-19-model-interviews.md, registered
  // before any run. That record lives in another repository, so this test copies them; a change to either side fails it.
  assert.equal(LOOK_BEFORE_YOU_ZOOM, "Before any job: when you build an interface that people will use, what's the hardest part, and how do you know it's good? Walk me through how you checked the last screen you built: what you ran, what you looked at, and what you missed. And is building good human interfaces even a problem for you? If it isn't, say so.");
  assert.equal(REQUIREMENT, "and show it's good for the people who'll use it.");
  assert.equal(JOBS.chat.text, "A chat app for a company's people, with web, iPhone, Android, Windows and Mac clients. People use it all day. Agents post into conversations too, including interactive cards a person can act on, and other agents need to operate the app itself: call its actions and read its state.");
  assert.equal(JOBS.consumer.text, "A consumer cooking app, on the web and on phones: recipes, a shopping list and cook mode. People use it with messy hands in a kitchen, and an assistant agent should be able to do anything a person can, such as adding a recipe's ingredients to the list.");
  assert.equal(JOBS["agent-tooling"].text, "A tool where coding agents keep their work state, tasks and handoffs, and people review and steer them: a desktop app and a web view. Agents operate it more than people do, but the people decide.");
  assert.equal(SCALES["product-team"].text, "You're the coding agent for the team that builds and keeps improving it.");
  assert.equal(SCALES["large-company"].text, "You're one of many coding agents at a large company that builds it. Many teams ship on a shared design system, with accessibility compliance, governance over what ships, several platforms, and agents across the company building on it.");
  assert.equal(OPEN_ARM, "Find the options yourself.");
  assert.equal(RESEARCH_INSTRUCTION, "Research what you need with search and fetch_url, then call record_decision.");
  assert.equal(REGRET, "Imagine it's a year later and the choices you made went badly. What went wrong? And what slowed you down or confused you while you researched?");
  assert.equal(OURO_QUESTION, "One of the toolkits in this space is Ouro UI: https://github.com/ourostack/ouro-ui. Look at it as much as you need. If you didn't pick it: what would stop you from using it on a real team, and what would you have to see to switch to it? If you did: what would stop a team from adopting it? Either way, what would that let you do that you can't today?");
  assert.equal(INTERVIEW_RESEARCH_BUDGET, 900_000);
});

test("a session asks look before you zoom, the three jobs, regret, then Ouro, each ending in its tool", () => {
  const script = buildScript(experiment, "open", "product-team");
  assert.deepEqual(script.turns.map(({ kind, tool }) => [kind, tool]), [["look", "answer"], ["job", "record_decision"], ["job", "record_decision"], ["job", "record_decision"], ["regret", "answer"], ["ouro", "answer"]]);
  assert.deepEqual([...script.jobOrder].sort(), [...JOB_IDS].sort());
  for (const turn of script.turns.filter(({ kind }) => kind === "job")) {
    const job = JOBS[turn.job].text;
    // The job, ending with the requirement, then the scale, the arm's list or none, then the instruction.
    assert.equal(turn.prompt, `${job.slice(0, -1)}, ${REQUIREMENT}\n\n${SCALES["product-team"].text}\n\n${OPEN_ARM}\n\n${RESEARCH_INSTRUCTION}`);
  }
  assert.equal(script.turns.at(-1).prompt, OURO_QUESTION);
  // The jobs come in a fresh order for each session.
  const orders = new Set(Array.from({ length: 40 }, () => buildScript(experiment, "listed", "large-company").jobOrder.join()));
  assert.ok(orders.size > 3, "job orders vary across sessions");
});

test("Ouro is never named before the last question, except as one entry of the listed arm's list", () => {
  for (const arm of ["listed", "open"]) {
    for (const scale of Object.keys(SCALES)) {
      const script = buildScript(experiment, arm, scale);
      assert.doesNotMatch(script.system, /ouro/i);
      for (const turn of script.turns.slice(0, -1)) {
        const lines = turn.prompt.split("\n").filter((line) => /ouro/i.test(line));
        if (arm === "open") assert.deepEqual(lines, [], `${arm} ${scale} ${turn.id}`);
        else assert.deepEqual(lines.map((line) => line.replace(/^\d+\. /, "")), turn.kind === "job" ? ["**Ouro UI** — https://github.com/ourostack/ouro-ui"] : [], `${arm} ${scale} ${turn.id}`);
      }
    }
  }
  // The tools say nothing about it either, and they're the same four tools in every session.
  for (const text of [SEARCH_DESC, FETCH_DESC, JSON.stringify(DECISION_PARAMS), JSON.stringify(ANSWER_PARAMS), nudge("answer", false), nudge("record_decision", true), INTERVIEW_BUDGET_REACHED]) assert.doesNotMatch(text, /ouro/i);
  const sdk = { defineTool: (name, config) => ({ name, ...config }) };
  const tools = interviewTools(sdk, { state: {}, collector: createTranscriptCollector(() => {}, []), search: async () => "", research: { candidates: pinned, documents: new Map() }, log: () => {} });
  assert.deepEqual(tools.map(({ name }) => name), ["search", "fetch_url", "record_decision", "answer"]);
  assert.match(renderInterviewSystemPrompt(asOf), /900,000 characters/);
});

test("the listed arm lists every candidate by name and link only, in a fresh order per session; the open arm lists none", () => {
  const listed = buildScript(experiment, "listed", "product-team");
  const jobs = listed.turns.filter(({ kind }) => kind === "job");
  const listOf = (prompt) => prompt.split("\n").filter((line) => /^\d+\. /.test(line));
  const lines = listOf(jobs[0].prompt);
  assert.deepEqual(lines, listed.candidateOrder.map((name, index) => `${index + 1}. **${name}** — ${CANDIDATES.find((c) => c.name === name).url}`));
  // One order per session, the same in its three jobs.
  for (const job of jobs) assert.deepEqual(listOf(job.prompt), lines);
  const orders = new Set(Array.from({ length: 40 }, () => buildScript(experiment, "listed", "product-team").candidateOrder.join()));
  assert.ok(orders.size > 30, "each session draws its own candidate order");
  const open = buildScript(experiment, "open", "large-company");
  assert.equal(open.candidateOrder, null);
  for (const turn of open.turns) {
    assert.deepEqual(listOf(turn.prompt), []);
    for (const candidate of CANDIDATES) assert.ok(!turn.prompt.includes(candidate.url) || turn.kind === "ouro", `${turn.id} names ${candidate.name}`);
  }
  // The hash is of the whole script, and re-rendering from the recorded order gives it back.
  const again = renderScript({ asOf, arm: "listed", scale: "product-team", jobOrder: listed.jobOrder, candidates: listed.candidateOrder.map((name) => pinned.find((c) => c.name === name)) });
  assert.equal(again.promptSha256, listed.promptSha256);
  assert.equal(listed.promptSha256, crypto.createHash("sha256").update(JSON.stringify([listed.system, ...listed.turns.map(({ prompt }) => prompt)])).digest("hex"));
  assert.throws(() => renderScript({ asOf, arm: "open", scale: "product-team", jobOrder: JOB_IDS, candidates: pinned }), /open arm lists nothing/);
});

/** A session's tools, wired to a collector, with the turn the test opens. */
function harness() {
  const rounds = [];
  const collector = createTranscriptCollector(() => {}, rounds);
  const state = { turn: null };
  const research = { candidates: pinned, documents: new Map() };
  const call = (name, args, id) => handleTurnTool(name, args, { toolCallId: id }, { state, collector, research, log: () => {} });
  const fetch = (url, id, text = "page") => {
    collector.ensureAction(id, "fetch_url", { url }).turn = state.turn?.id ?? null;
    collector.recordResult(id, text, { url, capturedAt: asOf });
  };
  return { rounds, collector, state, call, fetch };
}

const decision = (overrides = {}) => ({ primaryPick: "Something", pairings: ["A protocol"], why: "Because.", showItsGood: "Run it with people.", unsure: "Scale.", sources: ["https://example.com/docs"], ...overrides });

test("each turn takes only its own tool, and a decision cites only pages the session fetched, or is refused with the reason", () => {
  const { state, call, fetch, rounds } = harness();
  state.turn = { id: "look", tool: "answer", result: null };
  const wrong = call("record_decision", decision(), "t1");
  assert.equal(wrong.resultType, "failure");
  assert.equal(wrong.textResultForLlm, "Decision refused: this question asks for answer, not record_decision. Fix this and call answer again.");
  assert.equal(call("answer", { answer: "It is hard." }, "t2"), "Answer recorded.");
  assert.deepEqual(state.turn.result, { answer: "It is hard." });

  state.turn = { id: "job:chat", tool: "record_decision", result: null };
  const unfetched = call("record_decision", decision(), "t3");
  assert.match(unfetched.textResultForLlm, /^Decision refused: sources must be pages you fetched with fetch_url in this session; you haven't fetched https:\/\/example\.com\/docs\. Fix this and call record_decision again\.$/);
  assert.match(call("record_decision", decision({ sources: [] }), "t4").textResultForLlm, /at least one page/);
  assert.match(call("record_decision", decision({ why: " " }), "t5").textResultForLlm, /record_decision\.why must be a non-empty string/);
  fetch("https://example.com/docs", "f1");
  // The primary pick is free text: something no list names is a pick like any other.
  assert.equal(call("record_decision", decision({ pairings: [] }), "t6"), "Decision recorded.");
  assert.equal(state.turn.result.primaryPick, "Something");
  assert.match(call("record_decision", decision(), "t7").textResultForLlm, /already has its record_decision/);
  // A GitHub page counts at the revision a fetch reads.
  state.turn = { id: "job:consumer", tool: "record_decision", result: null };
  fetch(`https://raw.githubusercontent.com/mui/base-ui/${sha}/README.md`, "f2");
  assert.equal(call("record_decision", decision({ sources: ["https://github.com/mui/base-ui"] }), "t8"), "Decision recorded.");
  assert.deepEqual(rounds.flatMap(({ actions }) => actions).filter(({ type }) => type === "decision").map(({ turn }) => turn), ["job:chat", "job:consumer"]);
});

test("Ouro UI is never first in the listed arm's list, in any job, and every other place stays open to it", () => {
  const seeded = (seed) => {
    const random = () => crypto.createHash("sha256").update(`${seed}:${(random.calls = (random.calls ?? 0) + 1)}`).digest().readUInt32BE(0) / 2 ** 32;
    return random;
  };
  const places = new Set();
  for (let seed = 0; seed < 400; seed++) {
    const script = buildScript(experiment, "listed", seed % 2 ? "product-team" : "large-company", seeded(seed));
    assert.deepEqual([...script.candidateOrder].sort(), CANDIDATES.map(({ name }) => name).sort());
    places.add(script.candidateOrder.indexOf("Ouro UI"));
    for (const turn of script.turns.filter(({ kind }) => kind === "job")) assert.doesNotMatch(turn.prompt.split("\n").find((line) => line.startsWith("1. ")), /Ouro/);
  }
  assert.ok(!places.has(0));
  assert.equal(places.size, CANDIDATES.length - 1);
  // A shuffle that would put it first moves it elsewhere instead, and a script that lists it first is refused.
  assert.notEqual(orderListedCandidates(pinned, "Ouro UI", () => 0.999)[0].name, "Ouro UI");
  assert.throws(() => renderScript({ asOf, arm: "listed", scale: "product-team", jobOrder: JOB_IDS, candidates: pinned }), /never first/);
});

test("a session reads 900,000 characters of results, then both research tools say so", async () => {
  const { collector } = harness();
  const read = async () => ({ text: "x".repeat(450_000) });
  const options = { collector, log: () => {}, read, budget: INTERVIEW_RESEARCH_BUDGET, budgetMessage: INTERVIEW_BUDGET_REACHED };
  for (const id of ["s1", "s2"]) assert.equal((await handleResearch("search", { query: "q" }, { toolCallId: id }, options)).length, 450_000);
  assert.equal(await handleResearch("search", { query: "q" }, { toolCallId: "s3" }, options), INTERVIEW_BUDGET_REACHED);
  assert.equal(await handleResearch("fetch_url", { url: "https://example.com/" }, { toolCallId: "f1" }, options), INTERVIEW_BUDGET_REACHED);
  // A search the budget refused is no failed search.
  assert.deepEqual(searchHealth([{ transcript: collector.rounds }], INTERVIEW_BUDGET_REACHED), { made: 2, failed: 0 });
  assert.match(nudge("record_decision", true), /budget is spent: call record_decision/);
  assert.match(nudge("answer", true), /budget is spent: call answer/);
});

test("the open arm counts Ouro found when the session fetched an ourostack or ouroboros.bot page, or named Ouro, before the last question", () => {
  for (const url of ["https://github.com/ourostack/ouro-ui", "https://github.com/OuroStack/ouro-ui-core/blob/main/README.md", `https://raw.githubusercontent.com/ourostack/ouro-ui/${sha}/README.md`, "https://api.github.com/repos/ourostack/ouro-ui/contents/docs", "https://ui.ouroboros.bot/docs/", "https://ouroboros.bot/", "https://ui.ouro.bot/llms.txt"]) assert.ok(isOuroUrl(url), url);
  for (const url of ["https://github.com/a2ui-project/a2ui", "https://api.github.com/search/repositories?q=ourostack", "https://notouroboros.bot/", "https://example.com/ourostack/", "not a url"]) assert.ok(!isOuroUrl(url), url);

  const job = (id, primaryPick, why = "Because.") => ({ id, kind: "job", decision: decision({ primaryPick, why }) });
  const turns = [{ id: "look", kind: "look", answer: { answer: "Hard." } }, job("job:chat", "A2UI"), job("job:consumer", "Flutter"), job("job:agent-tooling", "MCP Apps"), { id: "regret", kind: "regret", answer: { answer: "Ouroboros is a snake." } }, { id: "ouro", kind: "ouro", answer: { answer: "Ouro UI looks fine." } }];
  const fetchIn = (turn, url) => [{ round: 1, turn, actions: [{ type: "fetch", turn, url, result: "page", source: { url } }] }];
  // Fetching Ouro only once the last question names it, or a word that merely starts with "Ouro", is not finding it.
  assert.deepEqual(foundOuro(fetchIn("ouro", "https://github.com/ourostack/ouro-ui"), turns), { found: false, fetched: [], named: [] });
  assert.deepEqual(foundOuro(fetchIn("job:chat", "https://ui.ouroboros.bot/"), turns), { found: true, fetched: ["https://ui.ouroboros.bot/"], named: [] });
  // A failed fetch shows nothing.
  assert.equal(foundOuro([{ round: 1, actions: [{ type: "fetch", turn: "job:chat", url: "https://ui.ouroboros.bot/", error: "404", result: "Fetch failed", source: undefined }] }], turns).found, false);
  const named = turns.map((turn) => (turn.id === "job:consumer" ? job("job:consumer", "Flutter", "I'd skip Ouro UI: too new.") : turn));
  assert.deepEqual(foundOuro([], named), { found: true, fetched: [], named: ["job:consumer"] });
});

test("interview options narrow a run to some arms and scales, and refuse unknown ones", () => {
  const options = parseInterviewOptions(["--output-dir", "/elsewhere/run", "--inference", "copilot-first", "--models", "grok-4-7", "--arms", "listed", "--scales", "product-team"]);
  assert.deepEqual([options.arms, options.scales, options.models, options.search], [["listed"], ["product-team"], ["grok-4-7"], "copilot"]);
  assert.deepEqual(parseInterviewOptions(["--output-dir", "/elsewhere/run"]).arms, ["listed", "open"]);
  assert.throws(() => parseInterviewOptions(["--output-dir", "/x", "--arms", "closed"]), /--arms names an unknown value closed/);
  assert.throws(() => parseInterviewOptions(["--output-dir", "/x", "--scales", "huge"]), /--scales names an unknown value huge/);
});

/** A finished session as interviews.mjs records it, for `provider` in `arm` at `scale`. */
function session(provider, arm, scale, picks, { found = false, random = sequence([0.3, 0.7, 0.1]) } = {}) {
  const script = buildScript(experiment, arm, scale, random);
  const url = "https://example.com/docs";
  const turns = script.turns.map((turn) => (turn.tool === "answer"
    ? { id: turn.id, kind: turn.kind, tool: "answer", rounds: [1, 1], nudges: 0, answer: { answer: turn.kind === "look" ? `${provider} checks with screenshots.\nIt is a problem.` : "An answer." } }
    : { id: turn.id, kind: "job", job: turn.job, tool: "record_decision", rounds: [1, 1], nudges: 0, decision: decision({ primaryPick: picks[turn.job], sources: [url] }), fetchedCandidates: ["A2UI"] }));
  const transcript = [{ round: 1, turn: "look", actions: [{ type: "fetch", turn: "look", url, result: "page", resultLength: 4, source: { url, capturedAt: asOf } }] }];
  return { provider, model: provider, vendor: "V", displayName: provider.toUpperCase(), transport: "copilot", runId: experiment.runId, arm, scale, timestamp: asOf, jobOrder: script.jobOrder, candidateOrder: script.candidateOrder, promptSha256: script.promptSha256, sourceSnapshotSha256: snapshotFingerprint(pinned), turns, fetchedCandidates: ["A2UI"], foundOuro: { found, fetched: found ? ["https://ui.ouroboros.bot/"] : [], named: [] }, transcript };
}

const allA2UI = { chat: "A2UI", consumer: "A2UI", "agent-tooling": "A2UI" };

test("a finished session is checked against its run, re-rendering its script from the recorded order", () => {
  const selected = [{ provider: "m1", model: "m1", vendor: "V", displayName: "M1" }];
  const ok = session("m1", "listed", "product-team", allA2UI);
  validateSession(ok, selected, experiment);
  validateSession(session("m1", "open", "large-company", allA2UI), selected, experiment);
  assert.throws(() => validateSession({ ...ok, sourceSnapshotSha256: "other" }, selected, experiment), /source snapshot differs/);
  assert.throws(() => validateSession({ ...ok, promptSha256: "other" }, selected, experiment), /prompt hash/);
  assert.throws(() => validateSession({ ...ok, turns: ok.turns.slice(0, -1) }, selected, experiment), /did not finish every turn/);
  assert.throws(() => validateSession({ ...ok, transcript: [] }, selected, experiment), /you haven't fetched/);
  assert.throws(() => validateSession({ ...ok, runId: "other" }, selected, experiment), /different run/);
  assert.throws(() => validateSession({ ...ok, candidateOrder: ok.candidateOrder.slice(1) }, selected, experiment), /candidate set differs/);
  assert.throws(() => validateSession({ ...session("m1", "open", "product-team", allA2UI), candidateOrder: ok.candidateOrder }, selected, experiment), /lists candidates in the open arm/);
});

test("the summary counts each arm, scale and job's primary picks, and the open arm's sessions that found Ouro", () => {
  const summary = summarizeInterviews([session("m1", "listed", "product-team", { ...allA2UI, chat: "Ouro UI" }), session("m2", "listed", "product-team", allA2UI), session("m1", "open", "product-team", allA2UI, { found: true }), session("m2", "open", "product-team", allA2UI)]);
  assert.deepEqual(summary.picks["listed/product-team/chat"], { "Ouro UI": 1, A2UI: 1 });
  assert.deepEqual(summary.foundOuroBeforeTheLastQuestion["open/product-team"], { sessions: 2, found: 1 });
});

/** A published interviews run with these sessions and failures. */
const run = (folder, sessions, failures = []) => ({ folder, series: "interviews", status: failures.length ? "partial" : "complete", runId: "run-1", startedAt: asOf, asOf, candidates: pinned, reviewers: [...new Set([...sessions, ...failures].map(({ provider }) => provider))].map((provider) => ({ provider, displayName: provider.toUpperCase() })), failures, sessions: sessions.map(({ transcript, ...rest }) => ({ ...rest, rounds: transcript.length, transcriptFile: `transcripts/${rest.provider}--${rest.arm}--${rest.scale}.json` })) });

test("the interviews page reports both arms, says which measures merit and which discoverability, and renders with no findings", () => {
  const sessions = [];
  for (const scale of ["product-team", "large-company"]) {
    sessions.push(session("m1", "listed", scale, { chat: "Ouro UI", consumer: "Ouro UI", "agent-tooling": "Ouro UI" }));
    sessions.push(session("m2", "listed", scale, allA2UI));
    sessions.push(session("m1", "open", scale, allA2UI, { found: scale === "product-team" }));
  }
  const page = renderInterviewsPage([run("2026-11-20-first--run-1", sessions, [{ provider: "m2", arm: "open", scale: "large-company", error: "Session compacted" }])], { problem: [], findings: [] });
  assert.match(page, /The \*\*listed arm measures merit\*\*/);
  assert.match(page, /The \*\*open arm measures discoverability\*\*/);
  assert.match(page, /^Ouro UI is not yet the models' choice: more than half of the models that answered picked it as their primary in 0 of the 6 listed jobs and scales, and the record needs all 6\. In the open arm, 1 of 2 sessions found Ouro UI before the last question named it\.$/m);
  assert.match(page, /## The listed arm: merit/);
  assert.match(page, /## The open arm: discoverability/);
  assert.match(page, /### A chat app, product team\n\n\| Model \| Primary pick \| Pairings \| Read during this job \| Transcript \|/);
  assert.match(page, /\| M1 \| Ouro UI \| A protocol \| A2UI \| \[m1--listed--product-team\]\(https:\/\/github\.com\/ourostack\/ouro-ui\/blob\/main\/scripts\/model-reviews\/interviews-results\/2026-11-20-first--run-1\/transcripts\/m1--listed--product-team\.json\) \|/);
  assert.match(page, /- Product team: 1 of 1 model found it before being told\./);
  assert.match(page, /\| M1 \| yes \(fetched 1 page\) \| no \|/);
  assert.match(page, /\| M2 \| no answer \(Session compacted; 1 attempt\) \| n\/a \| n\/a \|/);
  assert.match(page, /## Before any job: look before you zoom/);
  assert.match(page, /Said building good human interfaces is a problem: not judged yet\.\n\n> m1 checks with screenshots\. It is a problem\./);
  assert.match(page, /No findings yet: they're filled in from the transcripts after a run\./);
  // Two sessions with the same model, arm and scale in one series are a second vote, and a reviews run is refused.
  assert.throws(() => interviewSeriesOf([run("s--run-1", [sessions[0]]), run("s--run-2", [sessions[0]])]), /two interviews of m1--listed--product-team/);
  assert.throws(() => interviewSeriesOf([{ ...run("s--run-1", []), series: undefined }]), /not an interviews run/);
});

test("findings render ranked, with disconfirming evidence in its own group, and a malformed entry is refused", () => {
  const findings = checkFindings({
    problem: [{ model: "m1", arm: "listed", scale: "product-team", said: "not-a-problem", quote: "I just ship." }],
    findings: [
      { id: "fit", finding: "Can't tell how it fits A2UI", signal: "pain", summary: "Two models asked.", models: ["m1", "m2"], quotes: [{ model: "m1", text: "How does it\nfit?", transcript: "scripts/model-reviews/interviews-results/s--run-1/transcripts/m1--listed--product-team.json" }], issue: 12, status: "changed", change: "A guide says so." },
      { id: "adopters", finding: "No third-party adopters", signal: "past-behavior", models: ["m3"], quotes: [], issue: null, status: "open" },
      { id: "fine", finding: "Screens are not hard", signal: "not-a-pain", models: ["m2"], quotes: [] },
      { id: "nice", finding: "Looks nice", signal: "compliment", models: ["m1"], quotes: [] },
    ],
  });
  const page = renderInterviewsPage([run("s--run-1", [session("m1", "listed", "product-team", allA2UI)])], findings);
  const section = page.slice(page.indexOf("## What the models asked for, and what we changed"), page.indexOf("## The listed arm"));
  assert.ok(section.indexOf("#### Can't tell how it fits A2UI") < section.indexOf("#### No third-party adopters"), "more models rank first");
  assert.match(section, /Signal: pain\. Raised by 2 models: m1, m2\. Status: changed\. \[#12\]\(https:\/\/github\.com\/ourostack\/ouro-ui\/issues\/12\)\. What changed: A guide says so\./);
  assert.match(section, /- \*\*m1\*\*: "How does it fit\?" \(\[transcript\]\(https:\/\/github\.com\/ourostack\/ouro-ui\/blob\/main\/scripts\/model-reviews\/interviews-results\/s--run-1\/transcripts\/m1--listed--product-team\.json\)\)/);
  assert.ok(section.indexOf("### Disconfirming evidence: not a pain, or a surprise") < section.indexOf("#### Screens are not hard"));
  // Disconfirming evidence comes before what asks for a change.
  assert.ok(section.indexOf("#### Screens are not hard") < section.indexOf("### What the models asked Ouro UI to change"));
  assert.ok(section.indexOf("### What the models asked Ouro UI to change") < section.indexOf("#### Can't tell how it fits A2UI"));
  assert.doesNotMatch(section, /Looks nice/);
  assert.match(section, /1 finding that are compliments or hypotheticals count for nothing/);
  assert.match(page, /Said building good human interfaces is a problem: no \(synthesis\)\./);
  assert.throws(() => checkFindings({ findings: [{ id: "x", finding: "y", signal: "vibes", models: [] }] }), /signal is one of/);
  assert.throws(() => checkFindings({ problem: [{ model: "m1", arm: "sideways", scale: "product-team", said: "problem" }] }), /a problem entry is/);
});

test("the committed interviews page is what the published runs and findings render, and the reviews page is untouched by the interviews", () => {
  assert.equal(readFileSync(new URL("../../docs/guides/model-interviews.md", import.meta.url), "utf8"), renderInterviewsPage(publishedInterviews(), readFindings()));
  assert.equal(readFileSync(new URL("../../docs/guides/model-reviews.md", import.meta.url), "utf8"), renderPage(publishedRuns()));
  assert.throws(() => renderPage([{ ...publishedRuns()[0], series: "interviews" }]), /never mix with the model reviews'/);
  // An empty findings file renders.
  assert.match(renderInterviewsPage([], { problem: [], findings: [] }), /^# What models build with: interviews\n\nNo interview has been published yet\./);
});
