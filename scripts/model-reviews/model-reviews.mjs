#!/usr/bin/env node
// model-reviews.mjs: asks current frontier models which design system or interface toolkit they
// would choose to build interfaces that both people and agents use, across web and native.
//
// It is the Ouro UI counterpart of scripts/model-reviews.cjs in ourostack/ouroboros-website, and
// keeps its method (see METHODOLOGY.md next to this file). Run privately, outside this repository:
//
//   node scripts/model-reviews/model-reviews.mjs --inference copilot-first --output-dir <new folder>
//   node scripts/model-reviews/model-reviews.mjs --preflight --output-dir <new folder>
//
// The runtime is GitHub Copilot's SDK, which is deliberately not a dependency of this repository.
// Install it somewhere else (`npm i @github/copilot-sdk@1.0.13`) and set OURO_MODEL_REVIEWS_SDK to
// that folder.
//
// METHODOLOGY CONTRACT (the same as the Ouroboros script's)
// - Give every model only candidate names and URLs. Never add descriptions or evaluation dimensions.
// - Use the same instructions and tools for every model; shuffle the candidate order independently per model.
// - Share one stripped (`empty` mode) Copilot runtime. Inference is the model vendor's API or, in
//   copilot-first mode, GitHub Copilot, with the vendor's API only for a model Copilot lacks.
// - Disable hidden compaction and large-output indirection. Reject incomplete runs.
// - Resolve each GitHub candidate's source revision before research; the other candidates' pages are
//   captured when first fetched. Repair source-access failures the same way for every candidate.
// - Save every run privately. Never edit, paraphrase or curate a model's words.

import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { promises as dns } from "node:dns";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout } from "node:timers";
import { parseArgs } from "node:util";

/** `value` without the named keys. */
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The candidates, by name and URL only. A GitHub URL is pinned to the revision current at the
 * cutoff; another URL stands for itself, and `prefixes` says which fetched pages count as reading it.
 */
export const CANDIDATES = [
  { name: "Ouro UI", url: "https://github.com/ourostack/ouro-ui" },
  { name: "shadcn/ui", url: "https://github.com/shadcn-ui/ui" },
  { name: "Vercel UI SDK", url: "https://github.com/vercel-labs/ui" },
  { name: "Agent-native (Builder.io)", url: "https://github.com/BuilderIO/agent-native" },
  { name: "Radix UI", url: "https://github.com/radix-ui/primitives" },
  { name: "Base UI", url: "https://github.com/mui/base-ui" },
  { name: "React Aria and React Spectrum", url: "https://github.com/adobe/react-spectrum" },
  { name: "MUI", url: "https://github.com/mui/material-ui" },
  { name: "Chakra UI", url: "https://github.com/chakra-ui/chakra-ui" },
  { name: "Tamagui", url: "https://github.com/tamagui/tamagui" },
  { name: "Flutter", url: "https://github.com/flutter/flutter" },
  { name: "Fluent UI", url: "https://github.com/microsoft/fluentui" },
  {
    name: "Material 3 and Jetpack Compose",
    url: "https://developer.android.com/develop/ui/compose/designsystems/material3",
    prefixes: ["https://developer.android.com/develop/ui/compose", "https://developer.android.com/jetpack/androidx/releases/compose-material3"],
  },
  {
    name: "SwiftUI and Apple Human Interface Guidelines",
    url: "https://developer.apple.com/documentation/swiftui",
    prefixes: ["https://developer.apple.com/tutorials/data/documentation/swiftui", "https://developer.apple.com/tutorials/data/design/human-interface-guidelines"],
  },
  { name: "A2UI", url: "https://github.com/a2ui-project/a2ui" },
  { name: "OpenAI Apps SDK UI", url: "https://github.com/openai/apps-sdk-ui" },
  { name: "MCP Apps", url: "https://github.com/modelcontextprotocol/ext-apps" },
  { name: "json-render", url: "https://github.com/vercel-labs/json-render" },
  { name: "AI Elements", url: "https://github.com/vercel/ai-elements" },
  { name: "CopilotKit", url: "https://github.com/CopilotKit/CopilotKit" },
];

/** The target of the ranking in the research brief: the candidate this evaluation exists to measure. */
export const SUBJECT = "Ouro UI";

/** Models reached through GitHub Copilot where its catalog lists them, otherwise through the vendor's own API. */
export const REVIEW_MODELS = [
  { provider: "claude-opus-5-5", model: "claude-opus-5.5", vendor: "Anthropic", displayName: "Claude Opus 5.5" },
  { provider: "claude-opus-5", model: "claude-opus-5", vendor: "Anthropic", displayName: "Claude Opus 5" },
  { provider: "claude-sonnet-5-5", model: "claude-sonnet-5.5", vendor: "Anthropic", displayName: "Claude Sonnet 5.5" },
  { provider: "gpt-6-1-sol", model: "gpt-6.1-sol", vendor: "OpenAI", displayName: "GPT-6.1 Sol" },
  { provider: "gpt-6-astra", model: "gpt-6-astra", vendor: "OpenAI", displayName: "GPT-6 Astra" },
  { provider: "gemini-4-carbon", model: "gemini-4-carbon", vendor: "Google", displayName: "Gemini 4 Carbon" },
  { provider: "gemini-4-hydrogen", model: "gemini-4-hydrogen", vendor: "Google", displayName: "Gemini 4 Hydrogen" },
  { provider: "grok-4-7", model: "grok-4.7", vendor: "xAI", displayName: "Grok 4.7" },
  {
    provider: "minimax-m3",
    model: "MiniMax-M3",
    vendor: "MiniMax",
    displayName: "MiniMax M3",
    fallback: { key: "minimax", env: "MINIMAX_API_KEY", type: "openai", baseUrl: "https://api.minimax.io/v1" },
  },
];

export const INFERENCE_MODES = ["direct-api", "copilot-first"];
export const MAX_NUDGES = 5;
export const MAX_FETCH_CHARS = 10000;
const MAX_RESPONSE_BYTES = 2_000_000;
const EVALUATION_TIMEOUT_MS = 45 * 60 * 1000;
export const VERDICT_FIELDS = ["verdict", "pullQuote", "testimonial", "evaluations"];

// ---- unbiasing: order and prompt ---------------------------------------------------------------

/** A shuffled copy; `random` is injectable so a test can pin the order. */
export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The whole system prompt. It names each candidate and its URL, and nothing else about any of them. */
export function renderSystemPrompt(candidates, asOf) {
  return `You are choosing the design system or interface toolkit you would use to build interfaces that both people and agents use, across web and native platforms.

The research cutoff is ${asOf}. Candidate repository requests use revisions captured for this cutoff. Other web pages are captured when first fetched. Prefer current primary sources; distinguish documented facts from your inferences and uncertainty.

You have three tools:
1. **search** — search the web for information.
2. **fetch_url** — fetch a public URL, including GitHub directories, source files, and documentation. Follow the returned startIndex to continue reading a long document.
3. **final_verdict** — call this exactly once when you're done researching to submit your structured evaluation.

You MUST call a tool on every turn. Start by fetching each candidate's URL to learn what it is. Then go deeper through search and follow-up fetches. Take your time. Be thorough. There is no turn limit.

Here are the candidates, listed by name and URL only — no description is provided. Research each one yourself by fetching its URL and any docs you find:

${candidates.map((candidate, index) => `${index + 1}. **${candidate.name}** — ${candidate.url}`).join("\n")}

When you call final_verdict, be specific about architecture — not vague praise. For every candidate, explain the concrete trade-offs affecting your choice and what would address an objection, where applicable. Include links to primary sources you actually fetched. Do not substitute a guessed capability or an old default for evidence. Your final text may appear verbatim on a public website; speak in your own voice.`;
}

export function buildSystemPrompt(experiment, random = Math.random) {
  const shuffled = shuffle(experiment.candidates, random);
  const prompt = renderSystemPrompt(shuffled, experiment.asOf);
  return { prompt, candidateOrder: shuffled.map(({ name }) => name), promptSha256: crypto.createHash("sha256").update(prompt).digest("hex") };
}

// ---- credentials -------------------------------------------------------------------------------

const SECRET_STORES = ["model-reviews", "ouroboros", "slugger"];

function extractSecrets(secrets) {
  const providers = secrets.providers ?? {};
  return {
    anthropic: providers.anthropic?.apiKey || null,
    openai: providers.openai?.apiKey || null,
    gemini: providers.gemini?.apiKey || null,
    minimax: providers.minimax?.apiKey || null,
    perplexity: secrets.integrations?.perplexityApiKey || null,
  };
}

/** Environment variables first, then the first agent secret store (~/.agentsecrets/<agent>/secrets.json) that has the key. */
export function discoverKeys(env = process.env, home = os.homedir()) {
  const result = {
    anthropic: env["ANTHROPIC_API_KEY"] || null,
    openai: env["OPENAI_API_KEY"] || null,
    gemini: env["GEMINI_API_KEY"] || env["GOOGLE_API_KEY"] || null,
    minimax: env["MINIMAX_API_KEY"] || null,
    perplexity: env["PERPLEXITY_API_KEY"] || null,
  };
  for (const agent of SECRET_STORES) {
    const file = path.join(home, ".agentsecrets", agent, "secrets.json");
    if (!fs.existsSync(file)) continue;
    let found;
    try {
      found = extractSecrets(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      console.warn(`  Warning: failed to parse ${file}: ${error.message}`);
      continue;
    }
    for (const key of Object.keys(result)) if (!result[key] && found[key]) result[key] = found[key];
  }
  return result;
}

export const mask = (key) => (key ? "<configured>" : "<missing>");

const SECRET_ENV = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "MINIMAX_API_KEY", "PERPLEXITY_API_KEY"];

/** The environment the model runtime gets: ours without any credential. */
export function runtimeEnvironment(source = process.env) {
  const environment = { ...source };
  for (const name of SECRET_ENV) delete environment[name];
  return environment;
}

/** Each review's transport: Copilot where its catalog lists the model (copilot-first), otherwise the vendor's API. */
export function resolveTransports(reviews, availableModelIds, keys, inferenceMode = "direct-api") {
  return reviews.map((review) => {
    if (inferenceMode === "copilot-first" && availableModelIds.has(review.model)) return { ...review, transport: "copilot" };
    const fallback = review.fallback;
    if (!fallback) throw new Error(`${review.model} has no direct API route and is not in the Copilot catalog`);
    const apiKey = keys[fallback.key];
    if (!apiKey) throw new Error(`${review.model} requires ${fallback.env} for ${inferenceMode} inference`);
    const providerConfig = { type: fallback.type, baseUrl: fallback.baseUrl, apiKey };
    if (fallback.type === "openai") providerConfig.wireApi = "completions";
    return { ...review, transport: "direct-api", providerConfig };
  });
}

export function redactSecrets(text, secrets) {
  let redacted = String(text);
  for (const secret of secrets) if (secret && secret.length >= 8) redacted = redacted.split(secret).join("<redacted>");
  return redacted;
}

// ---- search ------------------------------------------------------------------------------------

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function requestPerplexity(query, apiKey, fetchImpl = globalThis.fetch, sleepImpl = sleep) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchImpl("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: query }] }),
    });
    if (response.ok) return (await response.json()).choices?.[0]?.message?.content || "(no results)";
    const text = await response.text();
    if (response.status !== 429 || attempt === 3) throw new Error(`Perplexity ${response.status}: ${text}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleepImpl(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 2000);
  }
  throw new Error("Perplexity retries exhausted");
}

let perplexityQueue = Promise.resolve();
// One queue for every model, so a burst never trips the rate limit.
function perplexitySearch(query, apiKey) {
  const request = perplexityQueue.then(() => requestPerplexity(query, apiKey), () => requestPerplexity(query, apiKey));
  perplexityQueue = request.catch(() => {});
  return request;
}

// ---- fetch -------------------------------------------------------------------------------------

const blockedIpv4 = new net.BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]]) blockedIpv4.addSubnet(network, prefix, "ipv4");
const blockedIpv6 = new net.BlockList();
for (const [network, prefix] of [["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32]]) blockedIpv6.addSubnet(network, prefix, "ipv6");

const isGithubRepoUrl = (url) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(url);
const repoPath = (url) => new URL(url).pathname.replace(/^\/|\/$/g, "");

/**
 * The URL a fetch really reads: a GitHub candidate's pages at the recorded revision, and Apple's
 * documentation (a page that needs JavaScript) as the JSON it renders from. Every candidate gets the same repair.
 */
export function resolveResearchUrl(rawUrl, candidates = []) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("fetch_url only permits HTTP(S) URLs");
  if (url.username || url.password) throw new Error("fetch_url does not permit credentials in URLs");
  url.hash = "";
  if (url.hostname === "developer.apple.com" && /^\/(documentation|design)\//.test(url.pathname)) {
    url.pathname = `/tutorials/data${url.pathname.replace(/\/$/, "")}.json`;
    url.search = "";
    return url.href;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const contentsApi = url.hostname === "api.github.com" && parts[0] === "repos" && parts[3] === "contents";
  if (!contentsApi && (!["github.com", "raw.githubusercontent.com"].includes(url.hostname) || parts.length < 2)) return url.href;

  const requestedRepo = (contentsApi ? parts.slice(1, 3) : parts.slice(0, 2)).join("/");
  const candidate = candidates.find((entry) => entry.sha && repoPath(entry.url).toLowerCase() === requestedRepo.toLowerCase());
  const repo = candidate ? repoPath(candidate.url) : requestedRepo;
  if (contentsApi) {
    url.pathname = `/repos/${repo}/contents${parts.length > 4 ? `/${parts.slice(4).join("/")}` : ""}`;
    if (candidate) url.searchParams.set("ref", candidate.sha);
    return url.href;
  }
  if (url.hostname === "raw.githubusercontent.com") {
    if (parts.length < 4) return url.href;
    return `https://raw.githubusercontent.com/${repo}/${candidate?.sha || parts[2]}/${parts.slice(3).join("/")}`;
  }
  if (parts.length === 2) return `https://raw.githubusercontent.com/${repo}/${candidate?.sha || "HEAD"}/README.md`;
  if (!["blob", "tree"].includes(parts[2]) || parts.length < 4) return url.href;
  const ref = candidate?.sha || parts[3];
  const filePath = parts.slice(4).join("/");
  if (parts[2] === "blob") return `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`;
  return `https://api.github.com/repos/${repo}/contents${filePath ? `/${filePath}` : ""}?ref=${encodeURIComponent(ref)}`;
}

export async function resolvePublicHttpUrl(rawUrl, lookup = dns.lookup) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("fetch_url only permits HTTP(S) URLs");
  if (url.username || url.password) throw new Error("fetch_url does not permit credentials in URLs");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".home.arpa")) {
    throw new Error(`fetch_url rejected private or reserved host ${hostname}`);
  }
  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address, family }) => (family === 6 ? blockedIpv6.check(address, "ipv6") : blockedIpv4.check(address, "ipv4")))) {
    throw new Error(`fetch_url rejected private or reserved host ${hostname}`);
  }
  return { url, addresses };
}

export async function assertPublicHttpUrl(rawUrl, lookup = dns.lookup) {
  return (await resolvePublicHttpUrl(rawUrl, lookup)).url;
}

/** A DNS lookup that answers only with the addresses already validated, so a rebinding cannot change them. */
export function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const family = typeof options === "object" ? options.family : 0;
    const candidates = family ? addresses.filter((entry) => entry.family === family) : addresses;
    if (typeof options === "object" && options.all) return callback(null, candidates);
    const selected = candidates[0] || addresses[0];
    if (!selected) return callback(new Error("No validated address available"));
    callback(null, selected.address, selected.family);
  };
}

function requestPublicUrl({ url, addresses }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const headers = { "Accept-Encoding": "identity", "User-Agent": "model-reviews/1.0" };
    const request = transport.get(url, { headers, lookup: createPinnedLookup(addresses) }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          request.destroy(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode || 0, statusText: response.statusMessage || "", location: response.headers.location, contentType: response.headers["content-type"] || "", text: Buffer.concat(chunks).toString("utf8") }));
      response.on("aborted", () => reject(new Error(`Response aborted while fetching ${url}`)));
      response.on("error", reject);
    });
    request.setTimeout(30000, () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.on("error", reject);
  });
}

export function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function readPublicDocument(url) {
  let target = url;
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const resolved = await resolvePublicHttpUrl(target);
    response = await requestPublicUrl(resolved);
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (!response.location) throw new Error(`Redirect from ${resolved.url} had no location`);
    target = new URL(response.location, resolved.url).href;
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error(`Too many redirects fetching ${target}`);
  if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} ${response.statusText} fetching ${target}`);
  return { url: target, text: response.text, contentType: response.contentType, capturedAt: new Date().toISOString() };
}

export function formatDirectory(entries) {
  if (!Array.isArray(entries)) throw new Error("GitHub did not return a directory listing");
  if (entries.length === 0) return "This directory is empty.";
  return entries
    .map((entry) => {
      if (typeof entry.name !== "string" || typeof entry.type !== "string" || typeof entry.html_url !== "string") throw new Error("Invalid GitHub directory entry");
      return `- ${JSON.stringify(entry.name)} (${entry.type}): ${entry.html_url}`;
    })
    .join("\n");
}

export function pageDocument(text, startIndex = 0) {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error("startIndex must be a nonnegative integer");
  const characters = Array.from(text);
  if (startIndex > characters.length) throw new Error(`startIndex ${startIndex} is beyond the document's ${characters.length} characters`);
  const end = Math.min(startIndex + MAX_FETCH_CHARS, characters.length);
  return { text: characters.slice(startIndex, end).join(""), startIndex, nextIndex: end < characters.length ? end : null, totalLength: characters.length };
}

/** Which candidate a fetched page is a source for: a GitHub candidate's pages at its revision, or a page under a web candidate's prefixes. */
export function candidateFor(candidates, parsed) {
  return candidates.find((candidate) => {
    if (candidate.sha) {
      const path = new URL(candidate.url).pathname;
      return (parsed.hostname === "raw.githubusercontent.com" && parsed.pathname.startsWith(`${path}/${candidate.sha}/`))
        || (parsed.hostname === "api.github.com" && (parsed.pathname === `/repos${path}/contents` || parsed.pathname.startsWith(`/repos${path}/contents/`)) && parsed.searchParams.get("ref") === candidate.sha);
    }
    return (candidate.prefixes ?? [candidate.url]).some((prefix) => parsed.href.startsWith(prefix));
  });
}

export async function fetchUrl(url, startIndex = 0, research = { candidates: [], documents: new Map() }, read = readPublicDocument) {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error("startIndex must be a nonnegative integer");
  const target = resolveResearchUrl(url, research.candidates);
  if (!research.documents.has(target)) {
    research.documents.set(target, (async () => {
      const document = await read(target);
      const parsed = new URL(document.url);
      let text = document.text;
      if (parsed.hostname === "api.github.com" && /^\/repos\/[^/]+\/[^/]+\/contents(?:\/|$)/.test(parsed.pathname)) {
        const contents = JSON.parse(text);
        if (Array.isArray(contents)) text = formatDirectory(contents);
        else if (contents?.type === "file" && contents.encoding === "base64" && typeof contents.content === "string") text = Buffer.from(contents.content, "base64").toString("utf8");
        else throw new Error("GitHub did not return readable file or directory content");
      } else if (document.contentType.includes("text/html")) text = stripHtml(text);
      const candidate = candidateFor(research.candidates, new URL(target));
      return { text, source: { url: document.url, capturedAt: document.capturedAt, ...(candidate && text.length > 0 ? { candidate: candidate.name, ...(candidate.sha ? { sha: candidate.sha } : {}) } : {}) } };
    })());
  }
  let document;
  try {
    document = await research.documents.get(target);
  } catch (error) {
    research.documents.delete(target);
    throw error;
  }
  const page = pageDocument(document.text, startIndex);
  const continuation = page.nextIndex === null ? "[End of document.]" : `[Continue this URL with startIndex=${page.nextIndex}. Offsets count Unicode code points.]`;
  return { ...page, source: document.source, text: `Source: ${document.source.url}\nCaptured: ${document.source.capturedAt}\nCharacters: ${startIndex}-${startIndex + Array.from(page.text).length} of ${page.totalLength}\n\n${page.text}\n\n${continuation}` };
}

/** Records each candidate's source at the cutoff: a GitHub candidate's latest commit at or before it, any other candidate's page as first fetched. */
export async function snapshotCandidates(asOf, read = readPublicDocument, candidates = CANDIDATES) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error("Invalid source snapshot cutoff");
  return Promise.all(candidates.map(async (candidate) => {
    if (!isGithubRepoUrl(candidate.url)) {
      const document = await read(resolveResearchUrl(candidate.url));
      return { ...candidate, capturedAt: document.capturedAt, pageSha256: crypto.createHash("sha256").update(document.text).digest("hex") };
    }
    const url = new URL(`https://api.github.com/repos/${repoPath(candidate.url)}/commits`);
    url.searchParams.set("until", asOf);
    url.searchParams.set("per_page", "1");
    const commits = JSON.parse((await read(url.href)).text);
    const commit = Array.isArray(commits) ? commits[0] : null;
    const committedAt = commit?.commit?.committer?.date;
    if (!/^[a-f0-9]{40}$/.test(commit?.sha || "") || !Number.isFinite(Date.parse(committedAt)) || Date.parse(committedAt) > Date.parse(asOf)) {
      throw new Error(`Could not resolve the source snapshot for ${candidate.name}`);
    }
    return { ...candidate, sha: commit.sha, committedAt, capturedAt: new Date().toISOString() };
  }));
}

export function snapshotFingerprint(candidates) {
  return crypto.createHash("sha256").update(JSON.stringify(candidates.map(({ name, url, sha, committedAt, capturedAt }) => [name, url, sha ?? null, committedAt ?? null, capturedAt]))).digest("hex");
}

// ---- tools and verdict -------------------------------------------------------------------------

const SEARCH_DESC = "Search the web for information about the candidates, their architecture, source code, documentation, or any other relevant information. Use specific, targeted queries.";
const SEARCH_PARAMS = { type: "object", properties: { query: { type: "string", description: "The search query" } }, required: ["query"], additionalProperties: false };
const FETCH_DESC = "Read a public URL, including GitHub READMEs, directory listings, source files, and documentation. A GitHub candidate's URLs use its recorded source revision. Follow the returned startIndex to continue a long document; repeated reads use the same captured document.";
const FETCH_PARAMS = {
  type: "object",
  properties: {
    url: { type: "string", description: "The URL to fetch" },
    startIndex: { type: "integer", minimum: 0, description: "Unicode code-point offset returned by a previous fetch; omit to start at zero." },
  },
  required: ["url"],
  additionalProperties: false,
};
const VERDICT_DESC = "Submit your final evaluation after completing research on every candidate. Call this exactly once when you are done. Your evaluation may appear verbatim on a public website attributed to you — write it in your own voice and stand behind it.";

/** The verdict tool's schema; the choices come in this session's shuffled order so the schema favors none. */
export function verdictParameters(candidateOrder) {
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: candidateOrder, description: "Name of the single candidate you would choose." },
      pullQuote: { type: "string", description: "A 1-2 sentence quote (25 words at most) that stands alone. The chosen candidate's name must appear in it. Do not begin with \"X is the only…\"." },
      testimonial: { type: "string", description: "3-5 sentence first-person quote explaining why YOU would choose your verdict over the others. MUST: (1) name your choice, (2) cite at least two specific features by name, (3) acknowledge one honest trade-off versus a candidate you considered but did not pick. Do not open with \"as an AI\" or \"as a model.\"" },
      evaluations: { type: "string", description: "For EACH candidate, use this exact markdown shape and separate entries with a blank line: **[candidate name]** — [specific architectural assessment, concrete trade-offs affecting your choice, and an inline Markdown link to a primary source you fetched]. State what would address an objection where applicable. Distinguish an observed gap from uncertainty; do not invent an objection." },
    },
    required: VERDICT_FIELDS,
    additionalProperties: false,
  };
}

export function evaluationSection(evaluations, name) {
  const marker = `**${name}**`;
  const start = evaluations.indexOf(marker);
  if (evaluations.indexOf(marker, start + marker.length) !== -1) throw new Error(`Duplicate evaluation for ${name}`);
  const remainder = evaluations.slice(start + marker.length);
  const next = remainder.search(/\n\s*\*\*[^*\n]+\*\*/);
  return next === -1 ? remainder : remainder.slice(0, next);
}

export function validateVerdict(verdict, candidates = CANDIDATES) {
  if (!verdict || typeof verdict !== "object") throw new Error("final_verdict must submit an object");
  for (const field of VERDICT_FIELDS) {
    if (typeof verdict[field] !== "string" || verdict[field].trim() === "") throw new Error(`final_verdict.${field} must be a non-empty string`);
  }
  if (!candidates.some(({ name }) => name === verdict.verdict)) throw new Error("final_verdict.verdict must name a known candidate");
  if (!verdict.pullQuote.includes(verdict.verdict)) throw new Error("final_verdict.pullQuote must name the chosen candidate");
  if (!verdict.testimonial.includes(verdict.verdict)) throw new Error("final_verdict.testimonial must name the chosen candidate");
  for (const { name } of candidates) {
    if (!verdict.evaluations.includes(`**${name}**`)) throw new Error(`final_verdict.evaluations is missing an evaluation for ${name}`);
  }
  for (const { name } of candidates) {
    const section = evaluationSection(verdict.evaluations, name);
    if (!/\]\(https?:\/\/[^)\s]+\)/.test(section) || !/[a-z]{3}/i.test(section.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/^[\s:—-]+/, ""))) {
      throw new Error(`final_verdict.evaluations requires a substantive source-linked evaluation for ${name}`);
    }
  }
  return verdict;
}

/** Throws unless the model fetched a source for every candidate and cited only pages it fetched. */
export function validateResearch(rounds, evaluations, candidates) {
  const fetched = rounds.flatMap(({ actions }) => actions).filter((action) => action.type === "fetch" && !action.error && typeof action.result === "string" && action.result.length > 0 && action.source);
  for (const candidate of candidates) {
    if (!fetched.some(({ source }) => source.candidate === candidate.name && (!candidate.sha || source.sha === candidate.sha))) {
      throw new Error(`Incomplete research: fetch a source from the recorded revision for ${candidate.name}`);
    }
  }
  const links = [...evaluations.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => resolveResearchUrl(match[1], candidates));
  if (links.some((url) => !fetched.some((action) => resolveResearchUrl(action.url, candidates) === url || resolveResearchUrl(action.source.url, candidates) === url))) {
    throw new Error("Every assessment citation must refer to a source you successfully fetched");
  }
}

const failedToolResult = (type, error) => `${type === "search" ? "Search" : "Fetch"} failed: ${error.message}`;

// ---- transcript --------------------------------------------------------------------------------

export function createLogger(logFile) {
  fs.writeFileSync(logFile, "", { flag: "wx", mode: 0o600 });
  return (message) => fs.appendFileSync(logFile, `${message}\n`);
}

export function createTranscriptCollector(log, rounds) {
  const roundsByCall = new Map();
  const actionsByToolCall = new Map();
  let currentRound = null;
  let compacted = false;

  function ensureRound(apiCallId) {
    const key = apiCallId || `round-${rounds.length + 1}`;
    let round = roundsByCall.get(key);
    if (!round) {
      round = { round: rounds.length + 1, thinking: "", actions: [] };
      roundsByCall.set(key, round);
      rounds.push(round);
      log(`── Round ${round.round} ──`);
    }
    currentRound = round;
    return round;
  }

  function ensureAction(toolCallId, toolName, args = {}) {
    let action = actionsByToolCall.get(toolCallId);
    if (action) return action;
    const round = currentRound || ensureRound();
    if (toolName === "search") action = { type: "search", query: args.query || "" };
    else if (toolName === "fetch_url") action = { type: "fetch", url: args.url || "", startIndex: args.startIndex ?? 0 };
    else if (toolName === "final_verdict") action = { type: "pending-verdict" };
    else action = { type: "tool", name: toolName };
    round.actions.push(action);
    actionsByToolCall.set(toolCallId, action);
    return action;
  }

  function onEvent(event) {
    if (event.agentId) return;
    if (event.type === "assistant.message") {
      const round = ensureRound(event.data.apiCallId || event.data.messageId);
      if (event.data.content) {
        round.thinking += (round.thinking ? "\n" : "") + event.data.content;
        log(`\n${event.data.content}\n`);
      }
    } else if (event.type === "tool.execution_start") {
      ensureAction(event.data.toolCallId, event.data.toolName, event.data.arguments || {});
    } else if (event.type === "tool.execution_complete" && !event.data.success) {
      const action = actionsByToolCall.get(event.data.toolCallId);
      if (action) {
        action.type = "error";
        action.message = event.data.error?.message || "Tool failed";
      }
    } else if (event.type === "session.compaction_start") {
      compacted = true;
    }
  }

  function recordResult(toolCallId, result, source) {
    const action = actionsByToolCall.get(toolCallId);
    if (!action) return;
    action.result = result;
    action.resultLength = result.length;
    if (source) action.source = source;
  }

  function recordError(toolCallId, error, result) {
    const action = actionsByToolCall.get(toolCallId);
    if (!action) return;
    action.error = error.message;
    action.result = result;
    action.resultLength = result.length;
  }

  function recordVerdict(toolCallId, verdict) {
    const action = actionsByToolCall.get(toolCallId) || ensureAction(toolCallId, "final_verdict");
    Object.assign(action, { type: "verdict", ...verdict });
  }

  return { rounds, onEvent, ensureAction, recordResult, recordError, recordVerdict, get compacted() { return compacted; } };
}

function createTools(sdk, collector, perplexityKey, onVerdict, log, research, candidateOrder) {
  const common = { skipPermission: true, defer: "never" };
  return [
    sdk.defineTool("search", {
      ...common,
      description: SEARCH_DESC,
      parameters: SEARCH_PARAMS,
      handler: async ({ query }, invocation) => {
        collector.ensureAction(invocation.toolCallId, "search", { query });
        log(`Search: "${query}"`);
        try {
          const result = await perplexitySearch(query, perplexityKey);
          collector.recordResult(invocation.toolCallId, result);
          log(`  ${result.length} chars`);
          return result;
        } catch (error) {
          const result = failedToolResult("search", error);
          collector.recordError(invocation.toolCallId, error, result);
          log(`  ERROR: ${error.message}`);
          return result;
        }
      },
    }),
    sdk.defineTool("fetch_url", {
      ...common,
      description: FETCH_DESC,
      parameters: FETCH_PARAMS,
      handler: async ({ url, startIndex = 0 }, invocation) => {
        collector.ensureAction(invocation.toolCallId, "fetch_url", { url, startIndex });
        log(`Fetch: ${url} (startIndex=${startIndex})`);
        try {
          const page = await fetchUrl(url, startIndex, research);
          collector.recordResult(invocation.toolCallId, page.text, page.source);
          log(`  ${page.text.length} chars`);
          return page.text;
        } catch (error) {
          const result = failedToolResult("fetch", error);
          collector.recordError(invocation.toolCallId, error, result);
          log(`  ERROR: ${error.message}`);
          return result;
        }
      },
    }),
    sdk.defineTool("final_verdict", {
      ...common,
      description: VERDICT_DESC,
      parameters: verdictParameters(candidateOrder),
      isTerminal: true,
      handler: (args, invocation) => {
        const verdict = validateVerdict(args, research.candidates);
        validateResearch(collector.rounds, verdict.evaluations, research.candidates);
        collector.recordVerdict(invocation.toolCallId, verdict);
        onVerdict(verdict);
        log(`Choice: ${verdict.verdict}`);
        return "Verdict accepted.";
      },
    }),
  ];
}

async function runEvaluation(client, sdk, review, perplexityKey, log, experiment, research, transcript) {
  const { prompt, candidateOrder, promptSha256 } = buildSystemPrompt(experiment);
  const collector = createTranscriptCollector(log, transcript);
  let verdict = null;
  const session = await client.createSession({
    model: review.model,
    provider: review.providerConfig,
    systemMessage: { mode: "replace", content: prompt },
    tools: createTools(sdk, collector, perplexityKey, (value) => { verdict = value; }, log, research, candidateOrder),
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
    onEvent: collector.onEvent,
  });
  try {
    for (let attempt = 0; attempt <= MAX_NUDGES && !verdict; attempt++) {
      const promptText = attempt === 0
        ? "Research each candidate thoroughly. Start by fetching each candidate's URL. Then call final_verdict when ready."
        : "You must call a tool every turn. Use search or fetch_url to continue researching, or call final_verdict when you have enough information.";
      await session.sendAndWait({ prompt: promptText }, EVALUATION_TIMEOUT_MS);
    }
  } finally {
    await session.disconnect();
  }
  if (collector.compacted) throw new Error("Session compacted; refusing to keep a transcript with hidden replacement context");
  if (!verdict) throw new Error("Model stopped without a valid final_verdict");
  return {
    provider: review.provider,
    model: review.model,
    vendor: review.vendor,
    displayName: review.displayName,
    transport: review.transport,
    runId: experiment.runId,
    timestamp: new Date().toISOString(),
    ...verdict,
    transcript: collector.rounds,
    candidateOrder,
    promptSha256,
    sourceSnapshotSha256: snapshotFingerprint(experiment.candidates),
    configuration: { contextTier: "default", reasoningEffort: "provider-default", infiniteSessions: false, largeOutputIndirection: false, systemMessageMode: "replace", tools: ["search", "fetch_url", "final_verdict"] },
  };
}

// ---- results -----------------------------------------------------------------------------------

/** Checks one finished review against the run it claims to belong to. */
export function validateResult(result, selected, experiment) {
  if (result.error) throw new Error(`Incomplete run: ${result.provider}: ${result.error}`);
  const expected = selected.find(({ provider }) => provider === result.provider);
  if (!expected || ["model", "vendor", "displayName"].some((key) => result[key] !== expected[key])) throw new Error(`Reviewer model identity mismatch for ${result.provider}`);
  if (result.runId !== experiment.runId) throw new Error(`Reviewer ${result.provider} belongs to a different run`);
  const names = experiment.candidates.map(({ name }) => name);
  if (result.candidateOrder.length !== names.length || new Set(result.candidateOrder).size !== names.length || names.some((name) => !result.candidateOrder.includes(name))) {
    throw new Error(`Reviewer ${result.provider} candidate set differs from the run`);
  }
  if (result.sourceSnapshotSha256 !== snapshotFingerprint(experiment.candidates)) throw new Error(`Reviewer ${result.provider} source snapshot differs from the run`);
  const ordered = result.candidateOrder.map((name) => experiment.candidates.find((candidate) => candidate.name === name));
  if (result.promptSha256 !== crypto.createHash("sha256").update(renderSystemPrompt(ordered, experiment.asOf)).digest("hex")) throw new Error(`Reviewer ${result.provider} prompt hash does not match the recorded candidates and cutoff`);
  validateVerdict(result, experiment.candidates);
  validateResearch(result.transcript, result.evaluations, experiment.candidates);
}

/** Counts of each pick, whether the subject was picked, and where it sits in each model's candidate order. */
export function summarize(results, subject = SUBJECT) {
  const picks = {};
  for (const result of results) picks[result.verdict] = (picks[result.verdict] || 0) + 1;
  const winner = Object.entries(picks).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    totalReviews: results.length,
    picks,
    winner,
    subjectPicks: picks[subject] || 0,
    subjectPositions: Object.fromEntries(results.map((result) => [result.provider, result.candidateOrder.indexOf(subject) + 1])),
  };
}

/** What a transcript keeps in the repository-safe record: each tool result as a prefix and a hash. */
export function compactTranscript(transcript, previewChars = 500) {
  return transcript.map((round) => ({
    ...round,
    actions: round.actions.map((action) => {
      if (typeof action.result !== "string") return { ...action };
      const prefix = Array.from(action.result).slice(0, previewChars).join("");
      return { ...action, result: prefix, resultLength: action.result.length, resultSha256: crypto.createHash("sha256").update(action.result).digest("hex"), resultTruncated: prefix !== action.result };
    }),
  }));
}

export const serializeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: { headless: { type: "boolean", default: true }, "output-dir": { type: "string" }, preflight: { type: "boolean", default: false }, inference: { type: "string" }, models: { type: "string" } },
  });
  if (values["output-dir"] === undefined || values["output-dir"].trim().length === 0) throw new Error("--output-dir requires a nonempty path");
  const inferenceMode = values.inference ?? "direct-api";
  if (!INFERENCE_MODES.includes(inferenceMode)) throw new Error("--inference must be direct-api or copilot-first");
  const models = values.models ? values.models.split(",").map((entry) => entry.trim()).filter(Boolean) : null;
  if (models) for (const provider of models) if (!REVIEW_MODELS.some((review) => review.provider === provider)) throw new Error(`--models names an unknown provider ${provider}`);
  return { outputDir: values["output-dir"], preflight: values.preflight, inferenceMode, models };
}

/** A run folder must be new and outside the repository, so a run's raw evidence is never committed there by accident. */
export function assertPrivateOutputDirectory(directory, repositoryRoots = [path.join(here, "..", "..")]) {
  const resolved = path.resolve(directory);
  for (const root of repositoryRoots) {
    const relative = path.relative(path.resolve(root), resolved);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error(`Run output must stay outside the repository: ${resolved}`);
  }
  return resolved;
}

async function loadSdk() {
  const dir = process.env["OURO_MODEL_REVIEWS_SDK"];
  if (!dir) return import("@github/copilot-sdk");
  return import(pathToFileURL(path.join(dir, "node_modules", "@github", "copilot-sdk", "dist", "index.js")).href);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const startedAt = new Date().toISOString();
  const experiment = { runId: crypto.randomUUID(), startedAt, asOf: startedAt, candidates: [] };
  const outputDirectory = assertPrivateOutputDirectory(options.outputDir);
  if (fs.existsSync(outputDirectory)) throw new Error(`Run directory already exists; choose a new one: ${outputDirectory}`);
  fs.mkdirSync(path.join(outputDirectory, "raw"), { recursive: true });

  const copilotFirst = options.inferenceMode === "copilot-first";
  const explicitToken = copilotFirst ? process.env["COPILOT_GITHUB_TOKEN"] || process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"] : undefined;
  const secrets = [explicitToken];
  const research = { candidates: [], documents: new Map() };
  let selected = [];
  let results;
  let client;
  let runtimeRoot;
  try {
    const keys = discoverKeys();
    secrets.push(...Object.values(keys));
    if (!keys.perplexity) throw new Error("PERPLEXITY_API_KEY is required for the shared search tool");
    const sdk = await loadSdk();
    runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "model-reviews-runtime-"));
    fs.mkdirSync(path.join(runtimeRoot, "copilot-home"));
    fs.mkdirSync(path.join(runtimeRoot, "work"));
    client = new sdk.CopilotClient({ mode: "empty", baseDirectory: path.join(runtimeRoot, "copilot-home"), workingDirectory: path.join(runtimeRoot, "work"), env: runtimeEnvironment(), gitHubToken: explicitToken, useLoggedInUser: copilotFirst && !explicitToken, logLevel: "error" });
    await client.start();
    if (copilotFirst) {
      const auth = await client.getAuthStatus();
      if (!auth.isAuthenticated) throw new Error(`GitHub Copilot authentication failed: ${auth.statusMessage || "run copilot login or set COPILOT_GITHUB_TOKEN"}`);
    }
    const [status, availableModels] = await Promise.all([client.getStatus(), copilotFirst ? client.listModels() : []]);
    const panel = options.models ? REVIEW_MODELS.filter(({ provider }) => options.models.includes(provider)) : REVIEW_MODELS;
    selected = resolveTransports(panel, new Set(availableModels.map(({ id }) => id)), keys, options.inferenceMode);
    const runtime = { name: "GitHub Copilot CLI", version: status.version, protocolVersion: status.protocolVersion, sdk: "@github/copilot-sdk", mode: "empty", inferenceMode: options.inferenceMode, infiniteSessions: false, largeOutputIndirection: false };

    console.log("Selected models:");
    for (const review of selected) console.log(`  ${review.displayName}: ${review.transport === "copilot" ? "GitHub Copilot inference" : `direct ${review.vendor} API (${mask(keys[review.fallback.key])})`}`);
    console.log(`  Perplexity search: ${mask(keys.perplexity)}`);
    experiment.candidates = await snapshotCandidates(experiment.asOf);
    research.candidates = experiment.candidates;
    console.log(`  Source snapshots: ${experiment.candidates.length} candidates`);
    fs.writeFileSync(path.join(outputDirectory, "run.json"), serializeJson({ status: options.preflight ? "preflight" : "running", ...experiment, runtime, reviewers: selected.map((review) => without(review, ["providerConfig", "fallback", "logFile", "log"])) }));
    if (options.preflight) {
      console.log("Access preflight complete. No inference was performed.");
      return;
    }

    for (const review of selected) {
      const writeLog = createLogger(path.join(outputDirectory, "raw", `${review.provider}.log`));
      review.log = (message) => writeLog(redactSecrets(message, secrets));
    }
    results = await Promise.all(selected.map(async (review) => {
      const transcript = [];
      try {
        const result = await runEvaluation(client, sdk, review, keys.perplexity, review.log, experiment, research, transcript);
        validateResult(result, selected, experiment);
        console.log(`  ${review.displayName} → ${result.verdict}`);
        return result;
      } catch (error) {
        const message = redactSecrets(error.message, secrets);
        review.log(`FATAL: ${message}`);
        console.error(`  ${review.displayName} failed: ${message}`);
        return { provider: review.provider, model: review.model, vendor: review.vendor, displayName: review.displayName, transport: review.transport, error: message, transcript };
      }
    }));

    const documents = await Promise.all(research.documents.values());
    const rawEvidence = serializeJson({ documents, results });
    if (redactSecrets(rawEvidence, secrets) !== rawEvidence) throw new Error("Refusing to save a completed artifact containing a configured credential");
    fs.writeFileSync(path.join(outputDirectory, "raw", "evidence.json"), rawEvidence, { flag: "wx" });
    const complete = results.filter((result) => !result.error);
    fs.mkdirSync(path.join(outputDirectory, "transcripts"));
    for (const result of results) {
      const { transcript, ...rest } = result;
      fs.writeFileSync(path.join(outputDirectory, "transcripts", `${result.provider}.json`), serializeJson({ ...rest, rounds: compactTranscript(transcript) }));
    }
    const summary = summarize(complete);
    fs.writeFileSync(path.join(outputDirectory, "run.json"), serializeJson({ status: complete.length === results.length ? "complete" : "partial", ...experiment, runtime, failures: results.filter((result) => result.error).map(({ provider, error }) => ({ provider, error })), summary, reviews: complete.map((review) => ({ ...without(review, ["transcript"]), rounds: review.transcript.length, transcriptFile: `transcripts/${review.provider}.json` })) }));
    console.log(`Saved run: ${path.join(outputDirectory, "run.json")}`);
    console.log(`Picks: ${JSON.stringify(summary.picks)}`);
  } finally {
    try {
      if (client) await client.stop();
    } finally {
      if (runtimeRoot) fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nFatal: ${error.message}`);
    process.exitCode = 1;
  });
}
