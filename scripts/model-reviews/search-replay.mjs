// Replays a published review's searches through GitHub Copilot's web search, to tell a change of search backend apart
// from other changes between reviews (METHODOLOGY.md, "Search"). It reads the queries from the review's committed
// transcripts and writes search-replay.json, which page.mjs reads.
//
//   OURO_MODEL_REVIEWS_SDK=<dir with @github/copilot-sdk> node scripts/model-reviews/search-replay.mjs <series> [out.json]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copilotSearch, limiter, runtimeEnvironment, BUDGET_REACHED } from "./model-reviews.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
/** An address of Ouro UI's own: its repositories or its sites. */
export const OURO_PAGE = /^https?:\/\/(?:(?:www\.)?github\.com\/ourostack\/|raw\.githubusercontent\.com\/ourostack\/|(?:[\w-]+\.)*ouroboros\.bot\/|(?:[\w-]+\.)*ouro\.bot\/)/i;

/** Every search a series' transcripts record, as { model, query, prefix }; a refused search (the budget) is left out. */
export function seriesSearches(series, dir = path.join(here, "results")) {
  const out = [];
  for (const folder of fs.readdirSync(dir).filter((f) => f.startsWith(`${series}--`)).sort()) {
    const transcripts = path.join(dir, folder, "transcripts");
    for (const file of fs.readdirSync(transcripts).sort()) {
      const t = JSON.parse(fs.readFileSync(path.join(transcripts, file), "utf8"));
      for (const action of (t.rounds ?? []).flatMap((round) => round.actions ?? [])) {
        if (action.type === "search" && action.result !== BUDGET_REACHED) out.push({ model: t.provider, gaveVerdict: !t.error, query: action.query, prefix: action.result ?? "" });
      }
    }
  }
  return out;
}

/** One replayed query: whether it names Ouro, whether the earlier answer's kept prefix did, and what Copilot returned. */
export function classifyReplay({ model, gaveVerdict, query, prefix }, text, error) {
  const base = { model, gaveVerdict, query, namesOuro: /ouro/i.test(query), perplexityMentionsOuro: /\bouro\b/i.test(prefix) };
  if (error) return { ...base, copilotError: error };
  const urls = [...text.matchAll(/^ {3}(https?:\/\/\S+)$/gm)].map((m) => m[1]);
  return { ...base, copilotResults: urls.length, copilotOuroPages: urls.filter((url) => OURO_PAGE.test(url)).length, copilotMentionsOuro: /\bouro\b/i.test(text) };
}

async function main([series, out = path.join(here, "search-replay.json")]) {
  if (!series) throw new Error("Usage: node scripts/model-reviews/search-replay.mjs <series> [out.json]");
  const runIds = fs.readdirSync(path.join(here, "results")).filter((f) => f.startsWith(`${series}--`)).map((f) => JSON.parse(fs.readFileSync(path.join(here, "results", f, "run.json"), "utf8")).runId);
  const searches = seriesSearches(series);
  const dir = process.env["OURO_MODEL_REVIEWS_SDK"];
  const sdk = await (dir ? import(pathToFileURL(path.join(dir, "node_modules", "@github", "copilot-sdk", "dist", "index.js")).href) : import("@github/copilot-sdk"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-reviews-replay-"));
  fs.mkdirSync(path.join(root, "home"));
  fs.mkdirSync(path.join(root, "work"));
  const token = process.env["COPILOT_GITHUB_TOKEN"] || process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"];
  const client = new sdk.CopilotClient({ mode: "empty", baseDirectory: path.join(root, "home"), workingDirectory: path.join(root, "work"), env: runtimeEnvironment(), gitHubToken: token, useLoggedInUser: !token });
  try {
    await client.start();
    const run = limiter(2);
    const queries = await Promise.all(searches.map((s) => run(async () => {
      try {
        return classifyReplay(s, await copilotSearch(client, sdk, s.query));
      } catch (error) {
        return classifyReplay(s, "", error.message);
      }
    })));
    const record = { about: `The ${series} review's searches, replayed through GitHub Copilot's web search by scripts/model-reviews/search-replay.mjs. perplexityMentionsOuro reads only the first 500 characters of each earlier answer, which is all the published transcripts keep.`, runIds, replayedAt: new Date().toISOString().slice(0, 10), queries };
    fs.writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Wrote ${out}: ${queries.length} searches, ${queries.filter((q) => q.copilotError).length} not replayed.`);
  } finally {
    await client.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Fatal: ${error.message}`);
    process.exitCode = 1;
  });
}
