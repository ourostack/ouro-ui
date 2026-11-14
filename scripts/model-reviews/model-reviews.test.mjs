import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { URL, fileURLToPath } from "node:url";
import { scratchDir } from "../scratch.mjs";
import {
  CANDIDATES,
  REVIEW_MODELS,
  SUBJECT,
  assertPrivateOutputDirectory,
  buildSystemPrompt,
  candidateFor,
  compactTranscript,
  createPinnedLookup,
  discoverKeys,
  evaluationSection,
  fetchUrl,
  pageDocument,
  parseOptions,
  renderSystemPrompt,
  requestPerplexity,
  resolveResearchUrl,
  resolveTransports,
  runtimeEnvironment,
  shuffle,
  snapshotCandidates,
  summarize,
  validateResearch,
  validateResult,
  validateVerdict,
  verdictParameters,
  assertPublicHttpUrl,
} from "./model-reviews.mjs";
import crypto from "node:crypto";

const sha = "a".repeat(40);
const pinned = CANDIDATES.map((candidate) => (candidate.url.startsWith("https://github.com/") ? { ...candidate, sha, committedAt: "2026-11-01T00:00:00Z", capturedAt: "2026-11-13T00:00:00Z" } : { ...candidate, capturedAt: "2026-11-13T00:00:00Z" }));

function verdict(choice = "shadcn/ui") {
  return {
    verdict: choice,
    pullQuote: `${choice} is where my hands go first.`,
    testimonial: `${choice} gives me a registry and a source I can read. Its cost is a pile of copied files.`,
    evaluations: CANDIDATES.map(({ name, url }) => `**${name}** — A specific assessment of its architecture and trade-offs, [source](${url}).`).join("\n\n"),
  };
}

/** A transcript in which the model fetched each candidate's own page. */
function transcriptFor(candidates) {
  return [{ round: 1, thinking: "", actions: candidates.map((candidate) => ({ type: "fetch", url: candidate.url, startIndex: 0, result: "text", resultLength: 4, source: { url: candidate.url, capturedAt: "2026-11-13T00:00:00Z", candidate: candidate.name, ...(candidate.sha ? { sha: candidate.sha } : {}) } })) }];
}

test("the candidate list names Ouro UI once among real alternatives and has no descriptions", () => {
  assert.equal(CANDIDATES.filter(({ name }) => name === SUBJECT).length, 1);
  for (const expected of ["shadcn/ui", "Vercel UI SDK", "Agent-native (Builder.io)", "Radix UI", "React Aria and React Spectrum", "MUI", "Chakra UI", "Material 3 and Jetpack Compose", "SwiftUI and Apple Human Interface Guidelines", "A2UI", "OpenAI Apps SDK UI"]) {
    assert.ok(CANDIDATES.some(({ name }) => name === expected), expected);
  }
  assert.equal(new Set(CANDIDATES.map(({ name }) => name)).size, CANDIDATES.length);
  for (const candidate of CANDIDATES) assert.deepEqual(Object.keys(candidate).filter((key) => !["name", "url", "prefixes"].includes(key)), []);
});

test("the prompt carries names and URLs only, and never favors the subject", () => {
  const prompt = renderSystemPrompt(CANDIDATES, "2026-11-13T00:00:00.000Z");
  for (const candidate of CANDIDATES) assert.ok(prompt.includes(`**${candidate.name}** — ${candidate.url}`));
  assert.ok(prompt.includes("both people and agents use, across web and native platforms"));
  // Nothing describes or praises a candidate, and no dimension to judge on is listed.
  for (const word of ["agent-first", "best", "recommended", "accessib", "consider", "dimension", "criteria"]) assert.ok(!prompt.toLowerCase().includes(word), word);
  const listed = prompt.split("\n").filter((line) => /^\d+\. \*\*.* — https:/.test(line));
  assert.equal(listed.length, CANDIDATES.length);
  assert.ok(!prompt.includes("ouro-ui-core"), "the prompt adds nothing about the subject");
});

test("shuffle is a permutation, deterministic given its random source, and different seeds reorder", () => {
  const sequence = (values) => { let i = 0; return () => values[i++ % values.length]; };
  const a = shuffle(CANDIDATES, sequence([0.1, 0.9, 0.5]));
  assert.deepEqual(a, shuffle(CANDIDATES, sequence([0.1, 0.9, 0.5])));
  assert.deepEqual([...a].sort((x, y) => x.name.localeCompare(y.name)), [...CANDIDATES].sort((x, y) => x.name.localeCompare(y.name)));
  assert.notDeepEqual(a.map(({ name }) => name), shuffle(CANDIDATES, sequence([0.9, 0.1, 0.3])).map(({ name }) => name));
  const original = [...CANDIDATES];
  shuffle(CANDIDATES);
  assert.deepEqual(CANDIDATES, original, "the list itself is never reordered");
});

test("each model gets its own order, a matching hash, and the schema's choices in that same order", () => {
  const experiment = { asOf: "2026-11-13T00:00:00.000Z", candidates: pinned };
  const first = buildSystemPrompt(experiment);
  assert.equal(first.promptSha256, crypto.createHash("sha256").update(first.prompt).digest("hex"));
  const positions = new Set();
  for (let i = 0; i < 40; i++) positions.add(buildSystemPrompt(experiment).candidateOrder.indexOf(SUBJECT));
  assert.ok(positions.size > 5, "the subject lands in many positions across models");
  assert.deepEqual(verdictParameters(first.candidateOrder).properties.verdict.enum, first.candidateOrder);
});

test("the verdict must pick a candidate, name it in the quotes and evaluate every candidate with a link", () => {
  assert.equal(validateVerdict(verdict()).verdict, "shadcn/ui");
  assert.throws(() => validateVerdict(verdict("Nothing")), /known candidate/);
  assert.throws(() => validateVerdict({ ...verdict(), pullQuote: "No name here." }), /pullQuote must name/);
  assert.throws(() => validateVerdict({ ...verdict(), testimonial: "No name here." }), /testimonial must name/);
  assert.throws(() => validateVerdict({ ...verdict(), evaluations: verdict().evaluations.replace("**MUI**", "**Mui**") }), /missing an evaluation for MUI/);
  assert.throws(() => validateVerdict({ ...verdict(), evaluations: verdict().evaluations.replace(/\[source\]\(https:\/\/github.com\/mui\/material-ui\)/, "no link") }), /source-linked evaluation for MUI/);
  assert.throws(() => validateVerdict({ ...verdict(), verdict: "" }), /non-empty/);
  assert.throws(() => validateVerdict(null), /object/);
  assert.throws(() => validateVerdict({ ...verdict(), evaluations: `${verdict().evaluations}\n\n**MUI** — again [x](https://example.com)` }), /Duplicate evaluation for MUI/);
  assert.match(evaluationSection(verdict().evaluations, "Radix UI"), /specific assessment/);
});

test("research must cover every candidate at its recorded revision and cite only fetched pages", () => {
  const rounds = transcriptFor(pinned);
  validateResearch(rounds, verdict().evaluations, pinned);
  const without = (name) => rounds.map((round) => ({ ...round, actions: round.actions.filter((action) => action.source.candidate !== name) }));
  assert.throws(() => validateResearch(without("Flutter"), verdict().evaluations, pinned), /Incomplete research.*Flutter/);
  assert.throws(() => validateResearch(without("A2UI"), verdict().evaluations, pinned), /A2UI/);
  const wrongSha = rounds.map((round) => ({ ...round, actions: round.actions.map((action) => (action.source.sha ? { ...action, source: { ...action.source, sha: "b".repeat(40) } } : action)) }));
  assert.throws(() => validateResearch(wrongSha, verdict().evaluations, pinned), /recorded revision/);
  assert.throws(() => validateResearch(rounds, `${verdict().evaluations}\n[never fetched](https://example.com/page)`, pinned), /citation/);
  // A failed fetch is not research.
  const failed = rounds.map((round) => ({ ...round, actions: round.actions.map((action) => ({ ...action, error: "boom" })) }));
  assert.throws(() => validateResearch(failed, verdict().evaluations, pinned), /Incomplete research/);
});

test("GitHub pages resolve to the recorded revision and Apple's JavaScript pages to the JSON they render from", () => {
  const ouro = pinned.find(({ name }) => name === SUBJECT);
  assert.equal(resolveResearchUrl("https://github.com/ourostack/ouro-ui", pinned), `https://raw.githubusercontent.com/ourostack/ouro-ui/${sha}/README.md`);
  assert.equal(resolveResearchUrl("https://github.com/ourostack/ouro-ui/blob/main/AGENTS.md", pinned), `https://raw.githubusercontent.com/ourostack/ouro-ui/${sha}/AGENTS.md`);
  assert.equal(resolveResearchUrl("https://raw.githubusercontent.com/ourostack/ouro-ui/main/docs/Button.md", pinned), `https://raw.githubusercontent.com/ourostack/ouro-ui/${sha}/docs/Button.md`);
  assert.equal(resolveResearchUrl("https://github.com/ourostack/ouro-ui/tree/main/docs", pinned), `https://api.github.com/repos/ourostack/ouro-ui/contents/docs?ref=${sha}`);
  assert.equal(resolveResearchUrl("https://api.github.com/repos/ourostack/ouro-ui/contents/docs", pinned), `https://api.github.com/repos/ourostack/ouro-ui/contents/docs?ref=${sha}`);
  assert.equal(resolveResearchUrl("https://api.github.com/repos/ourostack/ouro-ui/contents", pinned), `https://api.github.com/repos/ourostack/ouro-ui/contents?ref=${sha}`);
  assert.equal(resolveResearchUrl("https://github.com/ourostack/ouro-ui/issues/3", pinned), "https://github.com/ourostack/ouro-ui/issues/3");
  assert.equal(resolveResearchUrl("https://raw.githubusercontent.com/ourostack", pinned), "https://raw.githubusercontent.com/ourostack");
  // A repository that is not a candidate is read at the revision the model named.
  assert.equal(resolveResearchUrl("https://github.com/other/repo/blob/v1/x.md", pinned), "https://raw.githubusercontent.com/other/repo/v1/x.md");
  assert.equal(resolveResearchUrl("https://developer.apple.com/documentation/swiftui/", pinned), "https://developer.apple.com/tutorials/data/documentation/swiftui.json");
  assert.equal(resolveResearchUrl("https://developer.apple.com/design/human-interface-guidelines/buttons?x=1#a", pinned), "https://developer.apple.com/tutorials/data/design/human-interface-guidelines/buttons.json");
  assert.equal(resolveResearchUrl("https://example.com/a#b", pinned), "https://example.com/a");
  assert.throws(() => resolveResearchUrl("ftp://example.com", pinned), /HTTP/);
  assert.throws(() => resolveResearchUrl("https://user:pw@example.com", pinned), /credentials/);
  assert.ok(ouro.sha);
});

test("a fetched page counts as reading the candidate whose revision or prefix it matches", () => {
  const swift = pinned.find(({ name }) => name.startsWith("SwiftUI"));
  const material = pinned.find(({ name }) => name.startsWith("Material 3"));
  const raw = new URL(`https://raw.githubusercontent.com/ourostack/ouro-ui/${sha}/README.md`);
  assert.equal(candidateFor(pinned, raw).name, SUBJECT);
  assert.equal(candidateFor(pinned, new URL(`https://raw.githubusercontent.com/ourostack/ouro-ui/${"c".repeat(40)}/README.md`)), undefined);
  assert.equal(candidateFor(pinned, new URL(`https://api.github.com/repos/ourostack/ouro-ui/contents/docs?ref=${sha}`)).name, SUBJECT);
  assert.equal(candidateFor(pinned, new URL("https://api.github.com/repos/ourostack/ouro-ui/contents/docs?ref=main")), undefined);
  assert.equal(candidateFor(pinned, new URL("https://developer.apple.com/tutorials/data/design/human-interface-guidelines/buttons.json")), swift);
  assert.equal(candidateFor(pinned, new URL("https://developer.android.com/develop/ui/compose/components/button")), material);
  assert.equal(candidateFor(pinned, new URL("https://example.com/")), undefined);
  assert.equal(candidateFor([{ name: "Lone", url: "https://example.com/lone" }], new URL("https://example.com/lone/page")).name, "Lone");
});

test("fetchUrl pages a document, tags its source and reuses one capture", async () => {
  let reads = 0;
  const long = "x".repeat(25000);
  const read = async (url) => {
    reads++;
    return { url, text: long, contentType: "text/plain", capturedAt: "2026-11-13T00:00:00.000Z" };
  };
  const research = { candidates: pinned, documents: new Map() };
  const first = await fetchUrl("https://github.com/ourostack/ouro-ui", 0, research, read);
  assert.equal(first.source.candidate, SUBJECT);
  assert.equal(first.source.sha, sha);
  assert.match(first.text, /\[Continue this URL with startIndex=10000/);
  assert.match((await fetchUrl("https://github.com/ourostack/ouro-ui", 20000, research, read)).text, /\[End of document\.\]/);
  assert.equal(reads, 1);
  await assert.rejects(fetchUrl("https://github.com/ourostack/ouro-ui", -1, research, read), /nonnegative/);
  await assert.rejects(fetchUrl("https://github.com/ourostack/ouro-ui", 99999, research, read), /beyond/);
});

test("fetchUrl reads GitHub directory listings and base64 files, strips HTML, and forgets a failed read", async () => {
  const research = { candidates: pinned, documents: new Map() };
  const json = (value) => async (url) => ({ url, text: JSON.stringify(value), contentType: "application/json", capturedAt: "2026-11-13T00:00:00.000Z" });
  const directory = await fetchUrl("https://github.com/ourostack/ouro-ui/tree/main/docs", 0, research, json([{ name: "Button.md", type: "file", html_url: "https://github.com/x/Button.md" }]));
  assert.match(directory.text, /- "Button.md" \(file\): https:\/\/github.com\/x\/Button.md/);
  assert.equal(directory.source.candidate, SUBJECT);
  const file = await fetchUrl("https://api.github.com/repos/ourostack/ouro-ui/contents/AGENTS.md", 0, research, json({ type: "file", encoding: "base64", content: Buffer.from("hello").toString("base64") }));
  assert.match(file.text, /\nhello\n/);
  await assert.rejects(fetchUrl("https://api.github.com/repos/ourostack/ouro-ui/contents/odd", 0, research, json({ type: "symlink" })), /readable/);
  const html = await fetchUrl("https://example.com/page", 0, research, async (url) => ({ url, text: "<style>x{}</style><p>Hi &amp; <b>bye</b></p><script>1</script>", contentType: "text/html", capturedAt: "2026-11-13T00:00:00.000Z" }));
  assert.match(html.text, /Hi & bye/);
  let attempts = 0;
  const flaky = async (url) => {
    if (attempts++ === 0) throw new Error("down");
    return { url, text: "ok", contentType: "text/plain", capturedAt: "2026-11-13T00:00:00.000Z" };
  };
  await assert.rejects(fetchUrl("https://example.com/flaky", 0, research, flaky), /down/);
  assert.match((await fetchUrl("https://example.com/flaky", 0, research, flaky)).text, /ok/);
  assert.throws(() => pageDocument("x", 1.5), /nonnegative/);
});

test("snapshots pin each GitHub candidate to the commit at the cutoff and record other pages by hash", async () => {
  const asOf = "2026-11-13T00:00:00.000Z";
  const requested = [];
  const read = async (url) => {
    requested.push(url);
    if (url.startsWith("https://api.github.com/repos/")) return { url, text: JSON.stringify([{ sha, commit: { committer: { date: "2026-11-12T00:00:00Z" } } }]), capturedAt: "2026-11-13T00:00:01.000Z" };
    return { url, text: "page", capturedAt: "2026-11-13T00:00:01.000Z" };
  };
  const snapshot = await snapshotCandidates(asOf, read);
  assert.equal(snapshot.length, CANDIDATES.length);
  assert.equal(snapshot.find(({ name }) => name === SUBJECT).sha, sha);
  assert.equal(snapshot.find(({ name }) => name.startsWith("SwiftUI")).pageSha256, crypto.createHash("sha256").update("page").digest("hex"));
  assert.ok(requested.some((url) => url === "https://developer.apple.com/tutorials/data/documentation/swiftui.json"));
  assert.ok(requested.every((url) => !url.includes("until=") || url.includes(encodeURIComponent(asOf))));
  const bad = (text) => async (url) => (url.startsWith("https://api.github.com/") ? { url, text, capturedAt: asOf } : { url, text: "p", capturedAt: asOf });
  await assert.rejects(snapshotCandidates(asOf, bad("[]")), /Could not resolve the source snapshot/);
  await assert.rejects(snapshotCandidates(asOf, bad(JSON.stringify([{ sha, commit: { committer: { date: "2027-01-01T00:00:00Z" } } }]))), /Could not resolve/);
  await assert.rejects(snapshotCandidates("nope", read), /Invalid source snapshot cutoff/);
});

test("results are checked against their run, and a swapped prompt, order or snapshot fails", () => {
  const experiment = { runId: "run", asOf: "2026-11-13T00:00:00.000Z", candidates: pinned };
  const selected = [REVIEW_MODELS[0]];
  const { prompt, candidateOrder, promptSha256 } = buildSystemPrompt(experiment);
  assert.ok(prompt.length > 0);
  const result = {
    ...REVIEW_MODELS[0],
    runId: "run",
    ...verdict(),
    candidateOrder,
    promptSha256,
    sourceSnapshotSha256: crypto.createHash("sha256").update(JSON.stringify(pinned.map(({ name, url, sha: s, committedAt, capturedAt }) => [name, url, s ?? null, committedAt ?? null, capturedAt]))).digest("hex"),
    transcript: transcriptFor(pinned),
  };
  validateResult(result, selected, experiment);
  assert.throws(() => validateResult({ ...result, error: "x" }, selected, experiment), /Incomplete run/);
  assert.throws(() => validateResult({ ...result, provider: "nobody" }, selected, experiment), /identity mismatch/);
  assert.throws(() => validateResult({ ...result, displayName: "Other" }, selected, experiment), /identity mismatch/);
  assert.throws(() => validateResult({ ...result, runId: "other" }, selected, experiment), /different run/);
  assert.throws(() => validateResult({ ...result, candidateOrder: candidateOrder.slice(1) }, selected, experiment), /candidate set differs/);
  assert.throws(() => validateResult({ ...result, candidateOrder: [candidateOrder[1], candidateOrder[0], ...candidateOrder.slice(2)] }, selected, experiment), /prompt hash/);
  assert.throws(() => validateResult({ ...result, sourceSnapshotSha256: "0" }, selected, experiment), /source snapshot differs/);
  assert.throws(() => validateResult({ ...result, promptSha256: "0" }, selected, experiment), /prompt hash/);
});

test("the summary counts picks, finds the winner and records where the subject sat in each order", () => {
  const order = (position) => { const names = CANDIDATES.map(({ name }) => name).filter((name) => name !== SUBJECT); names.splice(position - 1, 0, SUBJECT); return names; };
  const summary = summarize([
    { provider: "a", verdict: "shadcn/ui", candidateOrder: order(3) },
    { provider: "b", verdict: "shadcn/ui", candidateOrder: order(1) },
    { provider: "c", verdict: SUBJECT, candidateOrder: order(20) },
  ]);
  assert.deepEqual(summary, { totalReviews: 3, picks: { "shadcn/ui": 2, [SUBJECT]: 1 }, winner: "shadcn/ui", subjectPicks: 1, subjectPositions: { a: 3, b: 1, c: 20 } });
  assert.deepEqual(summarize([]), { totalReviews: 0, picks: {}, winner: null, subjectPicks: 0, subjectPositions: {} });
});

test("a compact transcript keeps a prefix and the hash of each tool result, and nothing else changes", () => {
  const compact = compactTranscript([{ round: 1, thinking: "t", actions: [{ type: "search", query: "q", result: "r".repeat(600), resultLength: 600 }, { type: "verdict", verdict: "x" }] }], 500);
  assert.equal(compact[0].actions[0].result.length, 500);
  assert.equal(compact[0].actions[0].resultLength, 600);
  assert.equal(compact[0].actions[0].resultTruncated, true);
  assert.equal(compact[0].actions[0].resultSha256, crypto.createHash("sha256").update("r".repeat(600)).digest("hex"));
  assert.deepEqual(compact[0].actions[1], { type: "verdict", verdict: "x" });
  assert.equal(compactTranscript([{ round: 1, thinking: "", actions: [{ type: "fetch", result: "short" }] }])[0].actions[0].resultTruncated, false);
});

test("credentials come from the environment first, then the agent secret stores, and are never in the runtime's environment", () => {
  const home = scratchDir("model-reviews-home-");
  for (const [agent, secrets] of [
    ["ouroboros", { providers: { minimax: { apiKey: "" } }, integrations: { perplexityApiKey: "" } }],
    ["slugger", { providers: { minimax: { apiKey: "from-store-minimax" }, openai: { apiKey: "from-store-openai" } }, integrations: { perplexityApiKey: "from-store-search" } }],
  ]) {
    mkdirSync(join(home, ".agentsecrets", agent), { recursive: true });
    writeFileSync(join(home, ".agentsecrets", agent, "secrets.json"), JSON.stringify(secrets));
  }
  mkdirSync(join(home, ".agentsecrets", "model-reviews"), { recursive: true });
  writeFileSync(join(home, ".agentsecrets", "model-reviews", "secrets.json"), "{not json");
  const quiet = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  let keys;
  try {
    keys = discoverKeys({ OPENAI_API_KEY: "from-env", GOOGLE_API_KEY: "g" }, home);
  } finally {
    console.warn = quiet;
  }
  assert.deepEqual(keys, { anthropic: null, openai: "from-env", gemini: "g", minimax: "from-store-minimax", perplexity: "from-store-search" });
  assert.equal(warnings.length, 1);
  assert.deepEqual(discoverKeys({}, scratchDir("model-reviews-empty-")), { anthropic: null, openai: null, gemini: null, minimax: null, perplexity: null });
  const environment = runtimeEnvironment({ PATH: "/bin", GH_TOKEN: "t", GITHUB_TOKEN: "t", PERPLEXITY_API_KEY: "p", MINIMAX_API_KEY: "m" });
  assert.deepEqual(environment, { PATH: "/bin" });
});

test("a model Copilot lists goes through Copilot, a model it lacks needs its vendor key, and no key is invented", () => {
  const keys = { minimax: "k" };
  const copilot = new Set(REVIEW_MODELS.filter(({ fallback }) => !fallback).map(({ model }) => model));
  const resolved = resolveTransports(REVIEW_MODELS, copilot, keys, "copilot-first");
  assert.deepEqual(resolved.map(({ transport }) => transport), REVIEW_MODELS.map(({ fallback }) => (fallback ? "direct-api" : "copilot")));
  const minimax = resolved.find(({ provider }) => provider === "minimax-m3");
  assert.deepEqual(minimax.providerConfig, { type: "openai", baseUrl: "https://api.minimax.io/v1", apiKey: "k", wireApi: "completions" });
  assert.throws(() => resolveTransports(REVIEW_MODELS, copilot, {}, "copilot-first"), /MINIMAX_API_KEY/);
  // Direct mode never uses Copilot, so a model with no direct route cannot run.
  assert.throws(() => resolveTransports(REVIEW_MODELS, copilot, keys, "direct-api"), /no direct API route/);
  assert.deepEqual(resolveTransports([{ provider: "x", model: "x", fallback: { key: "anthropic", env: "ANTHROPIC_API_KEY", type: "anthropic", baseUrl: "u" } }], new Set(), { anthropic: "a" })[0].providerConfig, { type: "anthropic", baseUrl: "u", apiKey: "a" });
});

test("the panel has stable unique provider slugs and keeps every vendor's flagship", () => {
  assert.equal(new Set(REVIEW_MODELS.map(({ provider }) => provider)).size, REVIEW_MODELS.length);
  assert.deepEqual([...new Set(REVIEW_MODELS.map(({ vendor }) => vendor))].sort(), ["Anthropic", "Google", "MiniMax", "OpenAI", "xAI"]);
});

test("options require a new output folder outside the repository and a known inference mode and panel", () => {
  assert.deepEqual(parseOptions(["--output-dir", "/x", "--inference", "copilot-first", "--models", "grok-4-7, gpt-6-astra", "--preflight"]), { outputDir: "/x", preflight: true, inferenceMode: "copilot-first", models: ["grok-4-7", "gpt-6-astra"] });
  assert.deepEqual(parseOptions(["--output-dir", "/x"]), { outputDir: "/x", preflight: false, inferenceMode: "direct-api", models: null });
  assert.throws(() => parseOptions([]), /--output-dir/);
  assert.throws(() => parseOptions(["--output-dir", " "]), /--output-dir/);
  assert.throws(() => parseOptions(["--output-dir", "/x", "--inference", "cloud"]), /--inference/);
  assert.throws(() => parseOptions(["--output-dir", "/x", "--models", "nobody"]), /unknown provider/);
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  assert.throws(() => assertPrivateOutputDirectory(join(repo, "scripts", "out")), /outside the repository/);
  assert.throws(() => assertPrivateOutputDirectory(repo), /outside the repository/);
  assert.equal(assertPrivateOutputDirectory("/somewhere/else"), "/somewhere/else");
});

test("search retries a rate limit with the server's delay and gives up after four tries", async () => {
  const waits = [];
  const answers = [{ status: 429, headers: { "retry-after": "3" } }, { status: 429, headers: {} }, { status: 200, body: { choices: [{ message: { content: "found" } }] } }];
  const respond = (answer) => ({ ok: answer.status === 200, status: answer.status, headers: { get: (name) => answer.headers?.[name] ?? null }, text: async () => "limited", json: async () => answer.body });
  let call = 0;
  const result = await requestPerplexity("q", "key", async () => respond(answers[call++]), async (ms) => waits.push(ms));
  assert.equal(result, "found");
  assert.deepEqual(waits, [3000, 4000]);
  const empty = await requestPerplexity("q", "key", async () => respond({ status: 200, body: {} }));
  assert.equal(empty, "(no results)");
  await assert.rejects(requestPerplexity("q", "key", async () => respond({ status: 500 }), async () => {}), /Perplexity 500/);
  await assert.rejects(requestPerplexity("q", "key", async () => respond({ status: 429, headers: {} }), async () => {}), /Perplexity 429/);
});

test("fetching refuses private hosts and pins the addresses it validated", async () => {
  const lookup = (addresses) => async () => addresses;
  await assert.rejects(assertPublicHttpUrl("http://localhost/x"), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("http://127.0.0.1/x"), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("http://[::1]/x"), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("https://host.internal/x"), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("https://example.com/x", lookup([{ address: "10.0.0.5", family: 4 }])), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("https://example.com/x", lookup([{ address: "fe80::1", family: 6 }])), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("https://example.com/x", lookup([])), /private or reserved/);
  await assert.rejects(assertPublicHttpUrl("file:///etc/passwd"), /HTTP/);
  await assert.rejects(assertPublicHttpUrl("https://a:b@example.com/"), /credentials/);
  assert.equal((await assertPublicHttpUrl("https://example.com/x", lookup([{ address: "93.184.216.34", family: 4 }]))).href, "https://example.com/x");
  const pinnedLookup = createPinnedLookup([{ address: "93.184.216.34", family: 4 }, { address: "2606:2800::1", family: 6 }]);
  pinnedLookup("example.com", { all: true }, (error, all) => assert.equal(all.length, 2));
  pinnedLookup("example.com", { family: 6 }, (error, address, family) => assert.deepEqual([address, family], ["2606:2800::1", 6]));
  pinnedLookup("example.com", {}, (error, address) => assert.equal(address, "93.184.216.34"));
  createPinnedLookup([])("example.com", {}, (error) => assert.match(error.message, /No validated address/));
});
