// The adoption ledger: reads live state from GitHub (releases, repository files, code search, CI artifacts,
// merged pull requests, the `adoption` tracking issues) and writes site/src/adoption/ledger.json, which the
// /adoption/ page renders. Needs only Node and `gh`. See scripts/adoption/README.md.
//
//   node scripts/adoption/ledger.mjs [--out <file>] [--only <surface id>[,<id>]]
//
// Every cell is { value, note, source, measuredAt }. A measurement that could not be made is value null with a
// note saying why: nothing is invented.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentTrials } from "../agent-benchmark/page.mjs";
import { summarize } from "../agent-benchmark/run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const configPath = join(here, "ledger.config.json");
export const defaultOut = resolve(here, "../../site/src/adoption/ledger.json");

const sleepSync = (ms) => ms > 0 && Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The real `gh`: returns stdout as a string, or a Buffer with `binary`. Throws with gh's message on failure. */
export function realGh(args, { binary = false } = {}) {
  try {
    return execFileSync("gh", args, { encoding: binary ? "buffer" : "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const message = String(error.stderr || error.message).trim().split("\n")[0];
    throw new Error(`gh ${args.slice(0, 3).join(" ")}: ${message}`, { cause: error });
  }
}

const norm = (tag) => String(tag ?? "").replace(/^v/, "");
/** Two versions' order, part by part, as numbers: negative when a is older. */
const compareVersions = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return [0, 1, 2].map((i) => (x[i] ?? 0) - (y[i] ?? 0)).find((d) => d !== 0) ?? 0;
};
const short = (sha) => String(sha).slice(0, 7);
const blob = (repo, path) => `https://github.com/${repo}/blob/HEAD/${path}`;

/** The repository whose `adoption-data` branch holds the published ledger and its history. */
const LEDGER_REPO = "ourostack/ouro-ui";

export function createContext({ gh = realGh, now = () => new Date(), sleep = sleepSync, searchGapMs = 6500, searchBudgetMs = 15 * 60_000 } = {}) {
  const cache = new Map();
  const memo = (key, make) => {
    if (!cache.has(key)) {
      try {
        cache.set(key, { ok: make() });
      } catch (error) {
        cache.set(key, { error: error.message });
      }
    }
    const entry = cache.get(key);
    if ("error" in entry) throw new Error(entry.error);
    return entry.ok;
  };
  let lastSearch = 0;
  // GitHub rate-limits the workflow token's code search hard. Without a bound the waits add up past the hourly run's
  // timeout and nothing is published, so the waits share one budget; after it, a search is left unmeasured.
  const searchDeadline = now().getTime() + searchBudgetMs;
  const outOfTime = () => new Error("code search's time budget ran out (GitHub rate limited it)");
  const api = (path, extra = []) => JSON.parse(gh(["api", path, ...extra]));
  const text = (path) => Buffer.from(JSON.parse(gh(["api", path])).content, "base64").toString("utf8");
  /** Code search is limited to 10 requests a minute, so each waits its turn and a refusal is retried. */
  const search = (query, repo) =>
    memo(`search:${repo}:${query}`, () => {
      for (let attempt = 0; ; attempt += 1) {
        const wait = lastSearch + searchGapMs - now().getTime();
        if (now().getTime() + Math.max(wait, 0) > searchDeadline) throw outOfTime();
        if (wait > 0) sleep(wait);
        lastSearch = now().getTime();
        try {
          const data = JSON.parse(gh(["api", "-X", "GET", "search/code", "-f", `q=${query} repo:${repo}`, "-f", "per_page=100"]));
          return { total: data.total_count, paths: data.items.map((item) => item.path) };
        } catch (error) {
          if (attempt >= 4 || !/rate limit|403|429|try again in|secondary|abuse/i.test(error.message)) throw error;
          // GitHub says how long to wait ("try again in 14.9s"); a long wait is capped, and the next attempt asks again.
          const told = /try again in ([\d.]+)(ms|s)/i.exec(error.message);
          const pause = told ? Math.min(90000, Math.ceil(Number(told[1]) * (told[2] === "ms" ? 1 : 1000)) + 1000) : 30000;
          if (now().getTime() + pause > searchDeadline) throw new Error(`${error.message}; code search's time budget ran out`, { cause: error });
          sleep(pause);
        }
      }
    });
  /** GitHub's code search returns nothing for a query with more than two OR terms, so each term is searched on its own and the files joined. */
  const searchAny = (query, repo) => {
    const paths = new Set();
    for (const term of query.split(" OR ")) for (const path of search(term, repo).paths) paths.add(path);
    const parts = query.split(" OR ").map((term) => search(term, repo));
    return { total: parts.length === 1 ? parts[0].total : paths.size, paths: [...paths] };
  };
  return {
    gh,
    now,
    sleep,
    memo,
    api,
    text,
    search: searchAny,
    stamp: () => now().toISOString(),
    releases: (repo) =>
      memo(`releases:${repo}`, () =>
        gh(["api", "--paginate", `repos/${repo}/releases`, "--jq", ".[]|select(.draft|not)|select(.prerelease|not)|{tag:.tag_name,at:.published_at,url:.html_url}"])
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .sort((a, b) => b.at.localeCompare(a.at)),
      ),
    tree: (repo) =>
      memo(`tree:${repo}`, () => {
        const data = api(`repos/${repo}/git/trees/HEAD?recursive=1`);
        return { paths: data.tree.filter((node) => node.type === "blob").map((node) => node.path), truncated: Boolean(data.truncated) };
      }),
    repoInfo: (repo) => memo(`repo:${repo}`, () => api(`repos/${repo}`)),
  };
}

const cell = (ctx, value, { note, source } = {}) => ({ value, note: note ?? null, source: source ?? null, measuredAt: ctx.stamp() });
const unmeasured = (ctx, why, source) => cell(ctx, null, { note: `not measured: ${why}`, source });
const attempt = (ctx, source, make) => {
  try {
    return make();
  } catch (error) {
    return unmeasured(ctx, error.message, source);
  }
};

// ---- Ouro UI pins ----------------------------------------------------------------------------------------

export function latestReleases(ctx, config) {
  const out = {};
  for (const [key, entry] of Object.entries(config.latest)) {
    try {
      const list = ctx.releases(entry.repo);
      out[key] = { ...entry, tag: list[0].tag, at: list[0].at, url: list[0].url, count: list.length, error: null };
    } catch (error) {
      out[key] = { ...entry, tag: null, at: null, url: `https://github.com/${entry.repo}/releases`, count: 0, error: error.message };
    }
  }
  return out;
}

/** How many stable releases were published after `since` (an ISO date). */
const releasesAfter = (releases, since) => releases.filter((release) => release.at > since).length;

/** A product has a day to take a release: a missing release older than this is late. */
export const LATE_AFTER_MS = 24 * 60 * 60 * 1000;

/** How many of the releases published after `since` came out more than a day before `now`. */
const lateAfter = (ctx, releases, since) => {
  const cutoff = new Date(ctx.now().getTime() - LATE_AFTER_MS).toISOString();
  return releases.filter((release) => release.at > since && release.at <= cutoff).length;
};

/** The stable release `tag`, when it came out after every release in `releases` (the run's earlier read), else null. */
function releaseAfterSnapshot(ctx, repo, tag, releases) {
  try {
    const release = ctx.api(`repos/${repo}/releases/tags/${tag}`);
    if (!release || release.draft || release.prerelease) return null;
    const newest = releases.reduce((at, item) => (item.at > at ? item.at : at), "");
    return release.published_at > newest ? { at: release.published_at } : null;
  } catch {
    return null;
  }
}

function measurePin(ctx, surface, pin, latest) {
  const target = latest[pin.latest];
  const base = { label: pin.label, latestOf: target.repo, latestTag: target.tag };
  if (pin.from === "self") return { ...base, tag: target.tag, behind: 0, late: 0, note: "This repository is the release." };
  if (pin.from === "none") return { ...base, tag: null, behind: null, late: null, note: pin.reason };
  const file = pin.file;
  const source = blob(surface.repo, file);
  try {
    const raw = ctx.text(`repos/${surface.repo}/contents/${file}`);
    if (pin.from === "lock") {
      const entry = JSON.parse(raw).sources.find((item) => item.id === pin.source);
      if (!entry) throw new Error(`${file} has no source ${pin.source}`);
      const date = ctx.api(`repos/${entry.repository}/commits/${entry.commit}`).commit.committer.date;
      const releases = ctx.releases(target.repo);
      return { ...base, source, tag: `commit ${short(entry.commit)}`, behind: releasesAfter(releases, date), late: lateAfter(ctx, releases, date), note: `Vendored copy of ${entry.repository} at ${short(entry.commit)}, committed ${date.slice(0, 10)}.` };
    }
    const tag = pin.from === "json" ? JSON.parse(raw)[pin.key] : (new RegExp(pin.regex).exec(raw) ?? [])[1];
    if (!tag) throw new Error(`no version found in ${file}`);
    // A library's floor (SwiftPM's `from:`) with no resolved file committed builds against the newest release of its major,
    // so it lacks none while that release is in its range; it keeps the floor low on purpose, for apps on older minors.
    const [floorMajor] = norm(tag).split(".");
    if (pin.range === "major" && norm(target.tag).split(".")[0] === floorMajor && compareVersions(norm(target.tag), norm(tag)) >= 0) {
      return { ...base, source, tag: `${tag} and up`, behind: 0, late: 0, note: `A floor, from: "${tag}", with no resolved file: it builds against the newest ${floorMajor}.x, ${target.tag}.` };
    }
    const releases = ctx.releases(target.repo);
    const found = releases.find((release) => norm(release.tag) === norm(tag));
    if (!found) {
      // A release published after this run read the list is newer than every release in it, so the pin lacks none.
      const newer = releaseAfterSnapshot(ctx, target.repo, tag, releases);
      if (newer) return { ...base, source, tag, behind: 0, late: 0, note: `${tag} came out at ${newer.at}, after this run read ${target.repo}'s releases.` };
      return { ...base, source, tag, behind: null, late: null, note: `${tag} is not among ${target.repo}'s stable releases.` };
    }
    return { ...base, source, tag, behind: releasesAfter(releases, found.at), late: lateAfter(ctx, releases, found.at), note: null };
  } catch (error) {
    return { ...base, source, tag: null, behind: null, late: null, note: `not measured: ${error.message}` };
  }
}

export function measurePins(ctx, surface, latest) {
  const pins = surface.pins.map((pin) => measurePin(ctx, surface, pin, latest));
  if (pins.length === 0) return cell(ctx, [], { note: "No dependency on Ouro UI found in its files.", source: `https://github.com/${surface.repo}` });
  const known = pins.every((pin) => pin.behind !== null);
  return cell(ctx, pins, { note: known ? null : "At least one pin could not be read.", source: pins.find((pin) => pin.source)?.source ?? `https://github.com/${surface.repo}` });
}

/**
 * On current Ouro UI: it has pins, every pin could be read, and none lacks a release that has been out for more than a
 * day. Ouro UI releases several times a day, so "no release behind" would hold only for the minutes after a product
 * updates; a day is the program's own target (LATE_AFTER_MS), and the behind count stays in the cell for context.
 */
export const isCurrent = (pinsCell) => Array.isArray(pinsCell.value) && pinsCell.value.length > 0 && pinsCell.value.every((pin) => typeof pin.behind === "number" && pin.late === 0);

// ---- HX and AX -------------------------------------------------------------------------------------------

const searchUrl = (repo, query) => `https://github.com/search?q=${encodeURIComponent(`${query} repo:${repo}`)}&type=code`;

export function measureHx(ctx, surface) {
  const hx = surface.hx;
  const source = `https://github.com/${surface.repo}`;
  if (hx.kind === "na") return cell(ctx, "n/a", { note: hx.reason, source });
  return attempt(ctx, source, () => {
    if (hx.kind === "apple") {
      const components = ctx.search(hx.components, surface.repo).total;
      const foundation = ctx.search(hx.foundation, surface.repo).total;
      const value = components >= 5 ? "full" : components > 0 || foundation > 0 ? "partial" : "none";
      return cell(ctx, value, { note: `${components} source files use an OuroHX component (Button, Toast, Banner, Sheet, EmptyState); ${foundation} use OuroHX itself, tokens, motion, fonts or haptics.`, source: searchUrl(surface.repo, hx.components) });
    }
    let installed = null;
    let note = "";
    if (!hx.self) {
      const tree = ctx.tree(surface.repo);
      const names = new Set();
      for (const path of tree.paths) {
        const match = new RegExp(hx.treeDirs).exec(path);
        if (match && !/\.(test|stories)\./.test(path)) names.add(match[2]);
      }
      installed = names.size;
      note += `${installed} installed Ouro components${tree.truncated ? " (the file list was truncated)" : ""}; `;
    }
    const imports = ctx.search(hx.search, surface.repo).total;
    const tokens = ctx.search(hx.tokens, surface.repo).total;
    note += `${imports} files import them; ${tokens} files mention the Ouro tokens or theme.`;
    const used = hx.self ? imports : Math.min(installed, imports);
    const value = used >= 20 ? "full" : (installed ?? 0) > 0 || imports > 0 || tokens > 0 ? "partial" : "none";
    return cell(ctx, value, { note, source: searchUrl(surface.repo, hx.search) });
  });
}

export function measureAx(ctx, surface, config) {
  const ax = surface.ax;
  const source = `https://github.com/${surface.repo}`;
  if (ax.kind === "na") return cell(ctx, "n/a", { note: ax.reason, source });
  if (ax.kind === "none") return cell(ctx, "no", { note: ax.reason, source });
  return attempt(ctx, source, () => {
    if (ax.kind === "apple") {
      const total = ctx.search(`"import ${config.ax.appleImport}"`, surface.repo).total;
      return cell(ctx, total > 0 ? "yes" : "no", { note: `${total} source files import OuroAX.`, source: searchUrl(surface.repo, `"import ${config.ax.appleImport}"`) });
    }
    const exclude = ax.exclude ? new RegExp(ax.exclude) : null;
    const hits = ctx.search(ax.search, surface.repo).paths.filter((path) => !exclude || !exclude.test(path));
    const vendored = ax.vendored ? ctx.tree(surface.repo).paths.filter((path) => path.includes(ax.vendored)).length : 0;
    const value = hits.length > 0 || vendored > 0 ? "yes" : "no";
    const parts = [`${hits.length} files use defineCommand, bindAx or ax-mcp${exclude ? " outside the kit's own copy, its tests and fixtures" : ""}`];
    if (vendored) parts.push(`${vendored} kit files are vendored`);
    if (ax.note) parts.push(ax.note);
    return cell(ctx, value, { note: `${parts.join("; ")}.`, source: searchUrl(surface.repo, ax.search) });
  });
}

// ---- Actions on the one-action model --------------------------------------------------------------------

/** A declaration file the action generator writes: `actions.json`, with `generator: "ouro-actions <version>"`. */
const ACTIONS_FILE = /(^|\/)actions\.json$/;
/** Test fixtures and benchmark copies declare actions too, but are not the product's own. */
const ACTIONS_EXCLUDE = /(^|\/)(tests?|fixtures?|__fixtures__|agent-benchmark|node_modules)\//;

/**
 * The actions a product declares on the one-action model: the generated `actions.json` files in its repository
 * (ouro-ui-core's `ouro-actions` writes them from an `*.actions.mts` declaration), each action counted once per set.
 */
export function measureActions(ctx, surface) {
  const source = `https://github.com/${surface.repo}`;
  return attempt(ctx, source, () => {
    const tree = ctx.tree(surface.repo);
    const files = tree.paths.filter((path) => ACTIONS_FILE.test(path) && !ACTIONS_EXCLUDE.test(path));
    const ids = new Set();
    const sets = [];
    for (const file of files) {
      let data;
      try {
        data = JSON.parse(ctx.text(`repos/${surface.repo}/contents/${file}`));
      } catch {
        continue;
      }
      if (!/^ouro-actions\b/.test(String(data?.generator ?? "")) || !Array.isArray(data.actions)) continue;
      for (const action of data.actions) ids.add(`${data.set ?? file}:${action.id}`);
      sets.push({ file, set: data.set ?? null, generator: data.generator, count: data.actions.length });
    }
    if (sets.length === 0) {
      if (tree.truncated) throw new Error("the repository's file list was truncated and no declared actions were found in what it returned");
      return cell(ctx, 0, { note: "No actions declared on the one-action model: no actions.json written by ouro-actions in the repository.", source });
    }
    const parts = sets.map((item) => `${item.count} in ${item.set ? `the "${item.set}" set` : item.file} (${item.file}, ${item.generator})`);
    return cell(ctx, ids.size, { note: `Declared once and generated by ouro-actions: ${parts.join("; ")}.`, source: blob(surface.repo, sets[0].file) });
  });
}

// ---- X-ray -----------------------------------------------------------------------------------------------

function readArtifactReport(ctx, repo, artifact, tmp, wanted = "report.json") {
  return ctx.memo(`artifact:${repo}:${artifact.id}:${wanted}`, () => {
    const file = join(tmp, `${artifact.id}.zip`);
    writeFileSync(file, ctx.gh(["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`], { binary: true }));
    // `report.json` at the artifact's root, or in a folder when the upload named several paths (`xray/report.json`).
    const names = execFileSync("unzip", ["-Z1", file], { maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").split("\n").filter((name) => name === wanted || name.endsWith(`/${wanted}`));
    const name = names.sort((a, b) => a.split("/").length - b.split("/").length)[0];
    if (!name) throw new Error(`artifact ${artifact.name} has no ${wanted}`);
    const out = execFileSync("unzip", ["-p", file, name], { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out.toString("utf8"));
  });
}

/** The newest ax-xray report, over a surface's sources, that is for the right app and still downloadable. */
export function measureXray(ctx, surface) {
  const source = `https://github.com/${surface.repo}/actions`;
  if (surface.xray.length === 0) return unmeasured(ctx, "no X-ray runs in CI for this product yet", source);
  const tmp = mkdtempSync(join(tmpdir(), "ouro-adoption-xray-"));
  const found = [];
  const errors = [];
  try {
    for (const entry of surface.xray) {
      try {
        const query = entry.branch ? `&branch=${entry.branch}` : "";
        const runs = ctx.api(`repos/${entry.repo}/actions/workflows/${entry.workflow}/runs?status=success&per_page=3${query}`).workflow_runs;
        for (const run of runs) {
          const artifacts = ctx.api(`repos/${entry.repo}/actions/runs/${run.id}/artifacts?per_page=50`).artifacts.filter((artifact) => !artifact.expired && /xray/i.test(artifact.name));
          for (const artifact of artifacts) {
            let report;
            try {
              report = readArtifactReport(ctx, entry.repo, artifact, tmp);
            } catch {
              continue;
            }
            const name = report.target?.app?.name;
            if (entry.app && name?.toLowerCase() !== entry.app.toLowerCase()) continue;
            found.push({ report, run, entry, artifact });
          }
          if (found.some((item) => item.run.id === run.id)) break;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (found.length === 0) return unmeasured(ctx, errors[0] ?? "no downloadable report in the latest successful runs", source);
  found.sort((a, b) => b.report.at.localeCompare(a.report.at));
  // One report per checker: the X-ray's own claim set, and ouro-actions' action claims beside it. Each checker's newest
  // report counts, and their claims add up, so an app's action claims count as AX must claims with its X-ray's.
  const newest = [];
  for (const item of found) if (!newest.some((kept) => kept.report.tool === item.report.tool)) newest.push(item);
  const { report, run } = newest[0];
  const sum = (key) => newest.reduce((total, item) => total + (item.report.summary[key] ?? 0), 0);
  const must = sum("must");
  const scored = newest.find((item) => typeof item.report.summary.score === "number");
  return cell(
    ctx,
    {
      claims: sum("claims"),
      holding: sum("holding"),
      must,
      mustHolding: sum("mustHolding"),
      score: scored?.report.summary.score ?? null,
      checks: sum("checks"),
      claimSet: report.claimSet?.version ?? null,
      tool: `${report.tool} ${report.checker?.version ?? ""}`.trim(),
      app: report.target?.app?.name ?? null,
      commit: report.target?.commit ?? null,
      reportAt: report.at,
      run: run.html_url,
      reports: newest.map((item) => ({ tool: `${item.report.tool} ${item.report.checker?.version ?? ""}`.trim(), claimSet: item.report.claimSet?.version ?? null, must: item.report.summary.must, mustHolding: item.report.summary.mustHolding, reportAt: item.report.at, run: item.run.html_url })),
    },
    { note: must === 0 ? "The claim set has no must claims yet, so conforming is trivial." : newest.length > 1 ? `Adds up the newest report of each checker: ${newest.map((item) => item.report.tool).join(" and ")}.` : null, source: run.html_url },
  );
}

/** AX `must` claims pass in CI: a report exists, has must claims, and every one holds. A claim set with none is vacuous. */
export const mustPasses = (xrayCell) => Boolean(xrayCell.value) && xrayCell.value.must > 0 && xrayCell.value.mustHolding === xrayCell.value.must;

// ---- Ouro AX census --------------------------------------------------------------------------------------

/** A census report older than this no longer says how the product's doors stand. */
export const CENSUS_MAX_AGE_DAYS = 7;
const CENSUS_FILE = "census.json";
const CENSUS_MANIFEST = "scripts/ouro-census/dist-manifest.json";
const GAP_KEYS = ["weak", "undeclared", "unwalked", "stale"];
const orList = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`);

/** The census checker hash Ouro UI's latest web release ships in its manifest. */
function releasedChecker(ctx, web) {
  return ctx.memo(`census-manifest:${web.repo}:${web.tag}`, () => {
    let manifest;
    try {
      manifest = JSON.parse(ctx.text(`repos/${web.repo}/contents/${CENSUS_MANIFEST}?ref=${web.tag}`));
    } catch {
      throw new Error(`Ouro UI ${web.tag} has no census manifest (${CENSUS_MANIFEST})`);
    }
    if (manifest?.tool !== "ouro-census" || typeof manifest.checker !== "string") throw new Error(`Ouro UI ${web.tag}'s ${CENSUS_MANIFEST} names no checker hash`);
    return manifest.checker;
  });
}

/**
 * A product's Ouro AX census: the `census.json` in the `ax-census` artifact of the newest successful run on main of its
 * workflow. It counts only when the report is for main at that run's own commit, its checker is the one Ouro UI's
 * latest release ships (so a product can't weaken a walker and keep reporting), and it is at most a week old.
 */
export function measureCensus(ctx, surface, latest) {
  const census = surface.census;
  const repo = census?.repo ?? surface.repo;
  const source = `https://github.com/${repo}/actions`;
  if (!census) return unmeasured(ctx, "no Ouro AX census runs in CI for this product yet", source);
  return attempt(ctx, source, () => {
    const runs = ctx.api(`repos/${repo}/actions/workflows/${census.workflow}/runs?status=success&per_page=3&branch=main`).workflow_runs;
    const tmp = mkdtempSync(join(tmpdir(), "ouro-adoption-census-"));
    let found = null;
    try {
      for (const run of runs) {
        const artifact = ctx.api(`repos/${repo}/actions/runs/${run.id}/artifacts?per_page=50`).artifacts.find((item) => !item.expired && item.name === "ax-census");
        if (!artifact) continue;
        found = { run, report: readArtifactReport(ctx, repo, artifact, tmp, CENSUS_FILE) };
        break;
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    if (!found) throw new Error("no ax-census artifact in the latest successful runs on main");
    const { run, report } = found;
    if (report?.ax !== "census/1") throw new Error("the ax-census artifact holds no census/1 report");
    if (report.target?.ref !== "refs/heads/main") throw new Error(`the census ran on ${report.target?.ref ?? "an unknown ref"}, not main`);
    if (report.target?.commit !== run.head_sha) throw new Error(`the census reports commit ${short(report.target?.commit)}, but its run built ${short(run.head_sha)}`);
    const checker = releasedChecker(ctx, latest.web);
    if (report.checker?.sha256 !== checker) throw new Error(`the census's checker ${String(report.checker?.sha256).slice(0, 12)} is not the one Ouro UI ${latest.web.tag} released (${checker.slice(0, 12)})`);
    const age = ctx.now().getTime() - new Date(report.at).getTime();
    if (!(age <= CENSUS_MAX_AGE_DAYS * 86_400_000)) throw new Error(`the newest census is from ${String(report.at).slice(0, 10)}, more than ${CENSUS_MAX_AGE_DAYS} days ago`);
    const product = (report.products ?? []).find((item) => item.product === census.product);
    if (!product) throw new Error(`the census reports no ${census.product} product yet`);
    const summary = product.summary;
    const gaps = GAP_KEYS.reduce((total, key) => total + (summary[key] ?? 0), 0);
    // The released checker's hash vouches for its built-in walkers only. A kind a product's own walker walks (a built-in
    // kind too: the report doesn't say which walker found each door) counts once that walker's code, by its hash, is on
    // the surface's reviewed list.
    const walkers = report.checker.walkers ?? [];
    const reviewed = census.reviewed ?? {};
    const unreviewed = walkers.filter((walker) => reviewed[walker.name] !== walker.sha256);
    const productOnly = (kind) => unreviewed.some((walker) => walker.kinds.includes(kind));
    const walked = (product.walked?.kinds ?? []).filter((kind) => !productOnly(kind));
    const notWalked = census.kinds.filter((kind) => !(product.walked?.kinds ?? []).includes(kind));
    const missingKinds = census.kinds.filter((kind) => !walked.includes(kind));
    const productWalkers = walkers.map((walker) => walker.name);
    const parts = [`${summary.declared} of ${summary.found} doors declared; ${gaps === 0 ? "no gaps" : `${gaps} gaps (${GAP_KEYS.map((key) => `${summary[key] ?? 0} ${key}`).join(", ")})`}`];
    if (notWalked.length) parts.push(`it doesn't walk ${orList(notWalked)} doors yet`);
    for (const walker of unreviewed) {
      const kinds = walker.kinds.filter((kind) => census.kinds.includes(kind) && productOnly(kind));
      if (kinds.length) parts.push(`${orList(kinds)} doors are walked by ${walker.name}, whose code ${String(walker.sha256).slice(0, 12)} is not on the reviewed list`);
    }
    if (productWalkers.length) parts.push(`with the product's own walker${productWalkers.length === 1 ? "" : "s"} ${productWalkers.join(", ")}`);
    return cell(
      ctx,
      { found: summary.found, declared: summary.declared, gaps, ...Object.fromEntries(GAP_KEYS.map((key) => [key, summary[key] ?? 0])), baseline: summary.baseline ?? 0, walked, missingKinds, productWalkers, checker: report.checker.sha256, commit: report.target.commit, reportAt: report.at, run: run.html_url },
      { note: `${parts.join("; ")}.`, source: run.html_url },
    );
  });
}

/** Census at zero: the census finds doors, every one is declared with a valid card, and it walks every kind the product has. */
export const censusAtZero = (censusCell) => Boolean(censusCell.value) && censusCell.value.found > 0 && censusCell.value.gaps === 0 && censusCell.value.missingKinds.length === 0;

/** An n/a product's census holds only when it walks the product and finds no door at all. */
const censusFindsNothing = (censusCell) => Boolean(censusCell.value) && censusCell.value.found === 0 && censusCell.value.gaps === 0 && censusCell.value.missingKinds.length === 0;

// ---- Give-back -------------------------------------------------------------------------------------------

const RELEASE_TITLE = /^(Prepare main|Release |Version Packages|Bump |chore\(release\))/i;

export function mergedPrs(ctx, repos) {
  const all = [];
  for (const repo of repos) {
    const prs = ctx.memo(`prs:${repo}`, () => JSON.parse(ctx.gh(["pr", "list", "-R", repo, "--state", "merged", "--limit", "3000", "--json", "number,title,body,url,mergedAt,headRefName"])));
    for (const pr of prs) all.push({ ...pr, repo });
  }
  return all;
}

/** Merged pull requests into the Ouro UI repositories whose title, text or branch names the product. */
export function measureGiveBack(ctx, surface, prs, config) {
  const source = `https://github.com/search?q=${encodeURIComponent(`${(surface.giveBackTerms[0] ?? surface.name)} is:pr is:merged ${config.giveBackRepos.map((repo) => `repo:${repo}`).join(" ")}`)}&type=pullrequests`;
  if (surface.upstream) return { ...cell(ctx, null, { note: "n/a: this is the upstream; it is where the others give back to.", source }), prs: [] };
  const terms = surface.giveBackTerms.map((term) => new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i"));
  const hits = prs.filter((pr) => !RELEASE_TITLE.test(pr.title) && terms.some((term) => term.test(`${pr.title}\n${pr.body ?? ""}\n${pr.headRefName}`)));
  const list = hits.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)).map((pr) => ({ repo: pr.repo, number: pr.number, title: pr.title, url: pr.url, mergedAt: pr.mergedAt }));
  const result = cell(ctx, list.length, { note: surface.giveBackTerms.length ? `Merged pull requests whose title, text or branch mentions ${surface.giveBackTerms.map((term) => `"${term}"`).join(" or ")}.` : "No terms to match: none counted.", source });
  result.prs = list;
  return result;
}

export const gaveBack = (cellValue) => typeof cellValue.value === "number" && cellValue.value >= 1;

// ---- Tracking issues and the program ---------------------------------------------------------------------

export function readIssues(ctx, config) {
  const list = JSON.parse(ctx.gh(["issue", "list", "-R", config.home, "-l", config.label, "--state", "all", "--limit", "200", "--json", "number,title,body,state,url,updatedAt,closedAt"]));
  const byCard = {};
  let program = null;
  for (const issue of list) {
    const card = /<!--\s*adoption:card=([a-z0-9-]+)\s*-->/.exec(issue.body ?? "");
    if (card) byCard[card[1]] = issue;
    if (/<!--\s*adoption:program\s*-->/.test(issue.body ?? "")) program = issue;
  }
  return { byCard, program, count: list.length, open: list.filter((issue) => issue.state === "OPEN").length };
}

const issueView = (issue) => ({ number: issue.number, title: issue.title, url: issue.url, state: issue.state.toLowerCase(), updatedAt: issue.updatedAt });

/** The steps table of the program issue: `| Step | Depends on | Repo | State | Evidence |`. */
export function parseSteps(body) {
  const rows = [];
  for (const line of String(body ?? "").split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((part) => part.trim());
    if (cells.length < 5 || /^[-: ]+$/.test(cells[0]) || cells[0].toLowerCase() === "step") continue;
    rows.push({ id: cells[0].replace(/`/g, ""), dependsOn: cells[1] === "—" || cells[1] === "-" ? [] : cells[1].split(",").map((part) => part.trim()), repo: cells[2] === "—" ? null : cells[2], state: cells[3].toLowerCase(), evidence: cells[4] });
  }
  return rows;
}

const BENCHMARK_ARMS = { "action-model": "Action model", browser: "browser driving", bridge: "SDK-style bridge", "plain-mcp": "plain MCP" };
export const BENCHMARK_PAGE = "https://ui.ouroboros.bot/docs/agent-interfaces/";

/**
 * The agent interface benchmark's published runs on the web repository's main branch, counted as its page counts
 * them (scripts/agent-benchmark/page.mjs): for each model, interface and task, the latest run. The value is each
 * interface's tasks done out of trials run, across every model and task.
 */
export function measureBenchmark(ctx, config) {
  const repo = config.latest.web.repo;
  const dir = "scripts/agent-benchmark/results";
  return attempt(ctx, BENCHMARK_PAGE, () => {
    const folders = ctx.api(`repos/${repo}/contents/${dir}`).filter((entry) => entry.type === "dir").map((entry) => entry.name).sort();
    const runs = folders
      .map((folder) => ({ folder, ...JSON.parse(ctx.text(`repos/${repo}/contents/${dir}/${folder}/results.json`)) }))
      .filter((run) => !run.invalid && !run.models.every((model) => model.provider === "oracle"))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const trials = currentTrials(runs);
    if (!trials.length) return unmeasured(ctx, `no published run in ${repo}'s ${dir}`, BENCHMARK_PAGE);
    const arms = summarize(trials.map((trial) => ({ ...trial, model: "all" }))).arms.filter((row) => BENCHMARK_ARMS[row.arm]);
    arms.sort((a, b) => Object.keys(BENCHMARK_ARMS).indexOf(a.arm) - Object.keys(BENCHMARK_ARMS).indexOf(b.arm));
    const models = new Set(trials.map((trial) => trial.model)).size;
    const value = arms.map((row) => `${BENCHMARK_ARMS[row.arm]} ${row.successes} of ${row.trials} done`).join("; ");
    return cell(ctx, value, { note: `Tasks done, checked on the app's state, across ${trials.length} trials by ${models} models in the published runs. The page has steps, time, tokens and every transcript.`, source: BENCHMARK_PAGE });
  });
}

export function measureProgram(ctx, config, issues, latest, prsAll, giveBackCount, treeCount) {
  const programIssue = issues.program;
  const source = programIssue?.url ?? `https://github.com/${config.home}/issues?q=label%3A${config.label}`;
  const steps = programIssue ? parseSteps(programIssue.body).map((step) => ({ ...step, source })) : [];
  const stepState = (id) => steps.find((step) => step.id === id)?.state;
  const headline = [];
  const add = (key, label, value, note, from) => headline.push({ key, label, ...cell(ctx, value, { note, source: from }) });
  for (const [key, entry] of Object.entries(latest)) add(`release-${key}`, `${entry.name} latest release`, entry.tag, entry.error ? `not measured: ${entry.error}` : `Published ${String(entry.at).slice(0, 10)}.`, entry.url);
  add("components", "Ouro HX components in the registry", treeCount.value, treeCount.note, `https://github.com/${config.latest.web.repo}/tree/main/registry/ouro/components/ouro`);
  add("merged-prs", "Merged pull requests across the three Ouro UI repositories", prsAll.length, "Counted from each repository's merged pull requests.", `https://github.com/${config.latest.web.repo}/pulls?q=is%3Apr+is%3Amerged`);
  add("give-back", "Merged pull requests that name a product", giveBackCount, "Distinct pull requests counted by the give-back column.", `https://github.com/${config.home}/issues?q=label%3A${config.label}`);
  headline.push({ key: "benchmark", label: "Benchmark against browser driving, an SDK-style bridge and plain MCP", ...measureBenchmark(ctx, config) });
  add("model-reviews", "Frontier models pick Ouro UI in the model-reviews run", null, stepState("model-reviews-headline") === "done" ? "Not measured yet: the step is marked done but no result is read." : "not measured yet: the model-reviews headline step is not done.", source);
  return { issue: programIssue ? issueView(programIssue) : null, steps, headline, source, note: programIssue ? null : "not measured: the program tracking issue was not found" };
}

// ---- The whole ledger ------------------------------------------------------------------------------------

const hxRank = { full: 0, partial: 1, none: 2 };

/** A cell nobody could measure. An `n/a` cell (the upstream's own give-back) has nothing to measure, so it is not one. */
const isUnmeasured = (value) => value.value === null && !/^n\/a\b/.test(value.note ?? "");

// ---- The day before --------------------------------------------------------------------------------------

/** Each product's checks from an earlier ledger: what the page's "changed since" line compares, kept small. */
export function previousOf(earlier) {
  if (!earlier || !Array.isArray(earlier.surfaces) || typeof earlier.generatedAt !== "string") return null;
  return {
    generatedAt: earlier.generatedAt,
    surfaces: earlier.surfaces
      .filter((surface) => surface.conditions)
      .map((surface) => ({ id: surface.id, conditions: Object.fromEntries(Object.entries(surface.conditions).map(([key, value]) => [key, { met: Boolean(value?.met) }])) })),
  };
}

/**
 * The checks as the hourly run left them a day before `generatedAt`, read here, signed in, from the data branch's history,
 * so the page needs no call to GitHub's API (60 an hour unsigned) to say what changed. Null when there is none yet.
 */
export function measurePrevious(ctx, generatedAt, repo = LEDGER_REPO) {
  try {
    const until = new Date(Date.parse(generatedAt) - 24 * 60 * 60 * 1000).toISOString();
    const [commit] = ctx.api(`repos/${repo}/commits?sha=adoption-data&path=ledger.json&per_page=1&until=${until}`);
    if (!commit?.sha) return null;
    return previousOf(ctx.api(`repos/${repo}/contents/ledger.json?ref=${commit.sha}`, ["-H", "Accept: application/vnd.github.raw+json"]));
  } catch {
    return null;
  }
}

export function build(ctx, config, { only = null } = {}) {
  const latest = latestReleases(ctx, config);
  const issues = readIssues(ctx, config);
  const prs = (() => {
    try {
      return mergedPrs(ctx, config.giveBackRepos);
    } catch {
      return [];
    }
  })();
  const distinctGiveBack = new Set();
  const selected = config.surfaces.filter((surface) => !only || only.includes(surface.id));
  const surfaces = selected.map((surface) => {
    const url = surface.privateRepo ? null : `https://github.com/${surface.repo}`;
    const cards = config.cards.filter((card) => card.surfaces.includes(surface.id));
    const tracking = cell(ctx, cards.map((card) => (issues.byCard[card.id] ? issueView(issues.byCard[card.id]) : { number: null, title: card.title, url: null, state: "missing" })), {
      note: cards.length ? null : "No tracking issue yet: this product has no card.",
      source: `https://github.com/${config.home}/issues?q=label%3A${config.label}`,
    });
    let pins;
    let hx;
    let ax;
    let xray;
    let giveBack;
    let actions;
    let census;
    if (surface.privateRepo) {
      const why = "the repository is private, so a public run cannot read it";
      pins = unmeasured(ctx, why);
      hx = unmeasured(ctx, why);
      ax = unmeasured(ctx, why);
      xray = unmeasured(ctx, why);
      actions = unmeasured(ctx, why);
      census = unmeasured(ctx, why);
    } else {
      pins = measurePins(ctx, surface, latest);
      hx = measureHx(ctx, surface);
      ax = measureAx(ctx, surface, config);
      xray = measureXray(ctx, surface);
      actions = measureActions(ctx, surface);
      census = measureCensus(ctx, surface, latest);
    }
    giveBack = measureGiveBack(ctx, surface, prs, config);
    for (const pr of giveBack.prs) distinctGiveBack.add(pr.url);
    // A product with no agent interface of its own (the config's AX is `n/a`, with its reason) has nothing for the X-ray
    // to check, so that check does not apply, as give-back does not apply to the upstream. Census at zero is different:
    // a written reason is not enough, and the product's own census has to find no doors for it to hold as n/a.
    const axNa = surface.ax.kind === "na" && !surface.privateRepo;
    if (axNa && !mustPasses(xray)) xray = cell(ctx, null, { note: `n/a: ${surface.ax.reason}`, source: xray.source });
    const censusNa = axNa && censusFindsNothing(census);
    if (censusNa) census = cell(ctx, null, { note: `n/a: ${surface.ax.reason} Its census finds no doors.`, source: census.source });
    const conditions = {
      current: { label: "On current Ouro UI", met: isCurrent(pins) },
      census: { label: "Census at zero", met: censusAtZero(census) || censusNa },
      must: { label: "AX must claims pass in CI", met: mustPasses(xray) || axNa },
      gaveBack: { label: "Has given back", met: surface.upstream ? true : gaveBack(giveBack) },
    };
    const met = Object.values(conditions).filter((condition) => condition.met).length;
    return {
      id: surface.id,
      name: surface.name,
      kind: surface.kind,
      repo: surface.privateRepo ? null : surface.repo,
      url,
      inScope: surface.inScope !== false,
      scopeNote: surface.scopeNote ?? null,
      cells: { pins, hx, ax, actions, census, xray, giveBack, tracking },
      conditions,
      met,
      confirmed: met === 4,
    };
  });
  const inScope = surfaces.filter((surface) => surface.inScope);
  const treeCount = (() => {
    try {
      const names = new Set();
      for (const path of ctx.tree(config.latest.web.repo).paths) {
        const match = /^registry\/ouro\/components\/ouro\/([^/]+)\//.exec(path);
        if (match) names.add(match[1]);
      }
      return { value: names.size, note: "Folders under registry/ouro/components/ouro." };
    } catch (error) {
      return { value: null, note: `not measured: ${error.message}` };
    }
  })();
  const program = measureProgram(ctx, config, issues, latest, prs, distinctGiveBack.size, treeCount);
  // Releases behind: every in-scope product's measured pins added up, and the products with a release they have lacked for a day.
  const pinsOf = (surface) => (Array.isArray(surface.cells.pins.value) ? surface.cells.pins.value : []);
  const releasesBehind = inScope.reduce((sum, surface) => sum + pinsOf(surface).reduce((total, pin) => total + (pin.behind ?? 0), 0), 0);
  const late = inScope
    .map((surface) => ({ id: surface.id, name: surface.name, late: pinsOf(surface).reduce((total, pin) => total + (pin.late ?? 0), 0), behind: pinsOf(surface).reduce((total, pin) => total + (pin.behind ?? 0), 0) }))
    .filter((item) => item.late > 0);
  const order = [...inScope].sort((a, b) => a.met - b.met || (hxRank[a.cells.hx.value] ?? 3) - (hxRank[b.cells.hx.value] ?? 3) || a.name.localeCompare(b.name));
  const generatedAt = ctx.stamp();
  return {
    schema: 2,
    generatedAt,
    summary: { total: inScope.length, confirmed: inScope.filter((surface) => surface.confirmed).length, listed: surfaces.length, unmeasuredCells: surfaces.reduce((sum, surface) => sum + Object.values(surface.cells).filter(isUnmeasured).length, 0), releasesBehind, late, order: order.map((surface) => surface.id) },
    latest,
    program,
    cards: config.cards.map((card) => ({ id: card.id, title: card.title, outcome: card.outcome, surfaces: card.surfaces, issue: issues.byCard[card.id] ? issueView(issues.byCard[card.id]) : null })),
    surfaces,
    previous: measurePrevious(ctx, generatedAt),
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = { out: defaultOut, only: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = resolve(argv[++index]);
    else if (argv[index] === "--only") args.only = argv[++index].split(",");
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const ledger = build(createContext(), config, { only: args.only });
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`${ledger.summary.confirmed} of ${ledger.summary.total} confirmed; ${ledger.summary.unmeasuredCells} cells not measured; wrote ${args.out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
