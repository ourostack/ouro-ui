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
const short = (sha) => String(sha).slice(0, 7);
const blob = (repo, path) => `https://github.com/${repo}/blob/HEAD/${path}`;

export function createContext({ gh = realGh, now = () => new Date(), sleep = sleepSync, searchGapMs = 6500 } = {}) {
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
  const api = (path, extra = []) => JSON.parse(gh(["api", path, ...extra]));
  const text = (path) => Buffer.from(JSON.parse(gh(["api", path])).content, "base64").toString("utf8");
  /** Code search is limited to 10 requests a minute, so each waits its turn and a refusal is retried. */
  const search = (query, repo) =>
    memo(`search:${repo}:${query}`, () => {
      for (let attempt = 0; ; attempt += 1) {
        const wait = lastSearch + searchGapMs - Date.now();
        if (wait > 0) sleep(wait);
        lastSearch = Date.now();
        try {
          const data = JSON.parse(gh(["api", "-X", "GET", "search/code", "-f", `q=${query} repo:${repo}`, "-f", "per_page=100"]));
          return { total: data.total_count, paths: data.items.map((item) => item.path) };
        } catch (error) {
          if (attempt >= 3 || !/rate limit|403|secondary|abuse/i.test(error.message)) throw error;
          sleep(30000);
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

function measurePin(ctx, surface, pin, latest) {
  const target = latest[pin.latest];
  const base = { label: pin.label, latestOf: target.repo, latestTag: target.tag };
  if (pin.from === "self") return { ...base, tag: target.tag, behind: 0, note: "This repository is the release." };
  if (pin.from === "none") return { ...base, tag: null, behind: null, note: pin.reason };
  const file = pin.file;
  const source = blob(surface.repo, file);
  try {
    const raw = ctx.text(`repos/${surface.repo}/contents/${file}`);
    if (pin.from === "lock") {
      const entry = JSON.parse(raw).sources.find((item) => item.id === pin.source);
      if (!entry) throw new Error(`${file} has no source ${pin.source}`);
      const date = ctx.api(`repos/${entry.repository}/commits/${entry.commit}`).commit.committer.date;
      const releases = ctx.releases(target.repo);
      return { ...base, source, tag: `commit ${short(entry.commit)}`, behind: releasesAfter(releases, date), note: `Vendored copy of ${entry.repository} at ${short(entry.commit)}, committed ${date.slice(0, 10)}.` };
    }
    const tag = pin.from === "json" ? JSON.parse(raw)[pin.key] : (new RegExp(pin.regex).exec(raw) ?? [])[1];
    if (!tag) throw new Error(`no version found in ${file}`);
    const releases = ctx.releases(target.repo);
    const found = releases.find((release) => norm(release.tag) === norm(tag));
    if (!found) return { ...base, source, tag, behind: null, note: `${tag} is not among ${target.repo}'s stable releases.` };
    return { ...base, source, tag, behind: releasesAfter(releases, found.at), note: null };
  } catch (error) {
    return { ...base, source, tag: null, behind: null, note: `not measured: ${error.message}` };
  }
}

export function measurePins(ctx, surface, latest) {
  const pins = surface.pins.map((pin) => measurePin(ctx, surface, pin, latest));
  if (pins.length === 0) return cell(ctx, [], { note: "No dependency on Ouro UI found in its files.", source: `https://github.com/${surface.repo}` });
  const known = pins.every((pin) => pin.behind !== null);
  return cell(ctx, pins, { note: known ? null : "At least one pin could not be read.", source: pins.find((pin) => pin.source)?.source ?? `https://github.com/${surface.repo}` });
}

/** On current Ouro UI: it has pins, and every pin is on its repository's latest release. */
export const isCurrent = (pinsCell) => Array.isArray(pinsCell.value) && pinsCell.value.length > 0 && pinsCell.value.every((pin) => pin.behind === 0);

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

// ---- X-ray -----------------------------------------------------------------------------------------------

function readArtifactReport(ctx, repo, artifact, tmp) {
  return ctx.memo(`artifact:${repo}:${artifact.id}`, () => {
    const file = join(tmp, `${artifact.id}.zip`);
    writeFileSync(file, ctx.gh(["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`], { binary: true }));
    const out = execFileSync("unzip", ["-p", file, "report.json"], { maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
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
  const { report, run } = found[0];
  const summary = report.summary;
  return cell(
    ctx,
    {
      claims: summary.claims,
      holding: summary.holding,
      must: summary.must,
      mustHolding: summary.mustHolding,
      score: summary.score ?? null,
      checks: summary.checks,
      claimSet: report.claimSet?.version ?? null,
      tool: `${report.tool} ${report.checker?.version ?? ""}`.trim(),
      app: report.target?.app?.name ?? null,
      commit: report.target?.commit ?? null,
      reportAt: report.at,
      run: run.html_url,
    },
    { note: summary.must === 0 ? "The claim set has no must claims yet, so conforming is trivial." : null, source: run.html_url },
  );
}

/** AX `must` claims pass in CI: a report exists, has must claims, and every one holds. A claim set with none is vacuous. */
export const mustPasses = (xrayCell) => Boolean(xrayCell.value) && xrayCell.value.must > 0 && xrayCell.value.mustHolding === xrayCell.value.must;

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
  add("benchmark", "Benchmark against browser driving, an SDK-style bridge and plain MCP", null, stepState("benchmark") === "done" ? "Not measured yet: the step is marked done but no result is read." : "not measured yet: the benchmark step is not done.", source);
  add("model-reviews", "Frontier models pick Ouro UI in the model-reviews run", null, stepState("model-reviews-headline") === "done" ? "Not measured yet: the step is marked done but no result is read." : "not measured yet: the model-reviews headline step is not done.", source);
  return { issue: programIssue ? issueView(programIssue) : null, steps, headline, source, note: programIssue ? null : "not measured: the program tracking issue was not found" };
}

// ---- The whole ledger ------------------------------------------------------------------------------------

const hxRank = { full: 0, partial: 1, none: 2 };

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
  const actionModelDone = issues.program ? parseSteps(issues.program.body).find((step) => step.id === "action-model")?.state === "done" : false;
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
    if (surface.privateRepo) {
      const why = "the repository is private, so a public run cannot read it";
      pins = unmeasured(ctx, why);
      hx = unmeasured(ctx, why);
      ax = unmeasured(ctx, why);
      xray = unmeasured(ctx, why);
    } else {
      pins = measurePins(ctx, surface, latest);
      hx = measureHx(ctx, surface);
      ax = measureAx(ctx, surface, config);
      xray = measureXray(ctx, surface);
    }
    giveBack = measureGiveBack(ctx, surface, prs, config);
    for (const pr of giveBack.prs) distinctGiveBack.add(pr.url);
    const actions = actionModelDone ? unmeasured(ctx, "the one-action model is released but this product's actions are not counted yet", issues.program.url) : cell(ctx, 0, { note: "The one-action model is not released yet, so no product has actions on it.", source: issues.program?.url ?? `https://github.com/${config.home}/issues?q=label%3A${config.label}` });
    const conditions = {
      current: { label: "On current Ouro UI", met: isCurrent(pins) },
      oneAction: { label: "Actions on the one-action model", met: typeof actions.value === "number" && actions.value > 0 },
      must: { label: "AX must claims pass in CI", met: mustPasses(xray) },
      gaveBack: { label: "Has given back", met: gaveBack(giveBack) },
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
      cells: { pins, hx, ax, actions, xray, giveBack, tracking },
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
  const order = [...inScope].sort((a, b) => a.met - b.met || (hxRank[a.cells.hx.value] ?? 3) - (hxRank[b.cells.hx.value] ?? 3) || a.name.localeCompare(b.name));
  return {
    schema: 1,
    generatedAt: ctx.stamp(),
    summary: { total: inScope.length, confirmed: inScope.filter((surface) => surface.confirmed).length, listed: surfaces.length, unmeasuredCells: surfaces.reduce((sum, surface) => sum + Object.values(surface.cells).filter((value) => value.value === null).length, 0), order: order.map((surface) => surface.id) },
    latest,
    program,
    cards: config.cards.map((card) => ({ id: card.id, title: card.title, outcome: card.outcome, surfaces: card.surfaces, issue: issues.byCard[card.id] ? issueView(issues.byCard[card.id]) : null })),
    surfaces,
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
